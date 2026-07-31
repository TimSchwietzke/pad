package todo

import (
	"errors"
	"sort"
	"time"
)

// A recurring todo repeats on a fixed cadence. The rule lives on the task itself:
// checking an occurrence done keeps that row as the completed one and spawns the
// next occurrence (see spawnNextOccurrence in todos.go). Nothing here touches the
// database, so the date arithmetic below is unit-testable on its own.

// The supported cadences. Deliberately a small closed set rather than a full
// iCalendar RRULE — a personal dashboard needs "every 2 weeks", not BYSETPOS.
const (
	freqDaily   = "daily"
	freqWeekly  = "weekly"
	freqMonthly = "monthly"
	freqYearly  = "yearly"
)

// maxAdvanceSteps caps the catch-up loop in nextDue. A daily chore left alone for
// years would otherwise spin for a long time; past this we simply hand back the
// last date we reached, which the user can then correct by hand.
const maxAdvanceSteps = 1000

// maxAdvanceDays caps the day-by-day walk a weekday rule does. ~8 years, which
// only a very long-abandoned task could exhaust.
const maxAdvanceDays = 3000

// recurrenceRule is the repeat cadence of a todo: every `Interval` units of
// `Freq`, optionally pinned to specific weekdays and optionally ending.
type recurrenceRule struct {
	Freq     string `json:"freq"`
	Interval int32  `json:"interval"`
	// Weekdays pins a weekly rule to given days (ISO: 1 = monday … 7 = sunday),
	// so "every mon + thu" is one rule rather than two tasks. Empty means the
	// deadline's own weekday carries the series. Stored in todo_recurrence_days.
	Weekdays []int32 `json:"weekdays,omitempty"`
	// Until ends the series on a date; Count ends it after that many more
	// occurrences. They are mutually exclusive, and both nil means "forever".
	Until *time.Time `json:"until,omitempty"`
	Count *int32     `json:"count,omitempty"`
}

// validate rejects an unknown cadence or a non-positive interval. An interval of
// 0 is read as "not given" and becomes 1, so `{"freq":"weekly"}` just works. It
// also sorts and de-duplicates the weekdays, so the stored rule is canonical.
func (r *recurrenceRule) validate() error {
	switch r.Freq {
	case freqDaily, freqWeekly, freqMonthly, freqYearly:
	default:
		return errors.New(`recurrence.freq must be "daily", "weekly", "monthly" or "yearly"`)
	}
	if r.Interval == 0 {
		r.Interval = 1
	}
	if r.Interval < 1 {
		return errors.New("recurrence.interval must be >= 1")
	}

	if len(r.Weekdays) > 0 {
		// Weekdays only mean something for a weekly cadence — "every 2 months on
		// monday" has no obvious reading, so we reject it instead of guessing.
		if r.Freq != freqWeekly {
			return errors.New("recurrence.weekdays is only allowed with a weekly cadence")
		}
		seen := map[int32]bool{}
		days := make([]int32, 0, len(r.Weekdays))
		for _, d := range r.Weekdays {
			if d < 1 || d > 7 {
				return errors.New("recurrence.weekdays must be between 1 (monday) and 7 (sunday)")
			}
			if !seen[d] {
				seen[d] = true
				days = append(days, d)
			}
		}
		sort.Slice(days, func(i, j int) bool { return days[i] < days[j] })
		r.Weekdays = days
	}

	if r.Until != nil && r.Count != nil {
		return errors.New("recurrence.until and recurrence.count are mutually exclusive")
	}
	// 0 is a legitimate value, not a rejected one: a spent series carries it, and
	// the client sends back the rule it was given. Only a negative count is wrong.
	if r.Count != nil && *r.Count < 0 {
		return errors.New("recurrence.count must be >= 0")
	}
	return nil
}

// hasWeekday reports whether an ISO weekday is part of the rule.
func (r recurrenceRule) hasWeekday(d int32) bool {
	for _, w := range r.Weekdays {
		if w == d {
			return true
		}
	}
	return false
}

// nextDue is the deadline of the occurrence following `from`.
//
// It advances by whole intervals and keeps going until it lands after
// `notBefore` — a weekly chore ignored for a month should come back due next
// week, not still overdue. The time of day (and the location) of `from` is kept,
// so a task due friday 18:00 stays an evening task.
//
// @param from the current occurrence's deadline
// @param notBefore usually "now": the moment the result has to be later than
func nextDue(from time.Time, rule recurrenceRule, notBefore time.Time) time.Time {
	if rule.Freq == freqWeekly && len(rule.Weekdays) > 0 {
		return nextWeekdayDue(from, rule, notBefore)
	}
	next := from
	for i := 0; i < maxAdvanceSteps; i++ {
		next = advance(next, rule)
		if next.After(notBefore) {
			break
		}
	}
	return next
}

// nextWeekdayDue handles "every mon + thu": instead of adding a fixed span it
// walks forward day by day and takes the first selected weekday that lands in a
// week the interval actually covers. The week of `from` is the anchor, so
// "every 2 weeks on mon + thu" skips the weeks in between rather than drifting.
func nextWeekdayDue(from time.Time, rule recurrenceRule, notBefore time.Time) time.Time {
	anchor := dayIndex(weekStart(from))
	interval := int(rule.Interval)
	d := from
	for i := 0; i < maxAdvanceDays; i++ {
		d = d.AddDate(0, 0, 1)
		if !rule.hasWeekday(isoWeekday(d)) {
			continue
		}
		if (dayIndex(weekStart(d))-anchor)/7%interval != 0 {
			continue
		}
		if d.After(notBefore) {
			return d
		}
	}
	return d
}

// isoWeekday maps Go's Sunday-first weekday onto ISO-8601 (monday = 1).
func isoWeekday(t time.Time) int32 {
	if w := t.Weekday(); w == time.Sunday {
		return 7
	} else {
		return int32(w)
	}
}

// weekStart is the monday of t's week, keeping t's time of day.
func weekStart(t time.Time) time.Time {
	return t.AddDate(0, 0, -int(isoWeekday(t))+1)
}

// dayIndex counts whole days from the epoch, computed on the calendar date only
// so that a DST change can't make a "week" 167 or 169 hours long.
func dayIndex(t time.Time) int {
	return int(time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC).Unix() / 86400)
}

// advance moves a date forward by exactly one interval of the rule.
func advance(t time.Time, rule recurrenceRule) time.Time {
	n := int(rule.Interval)
	switch rule.Freq {
	case freqDaily:
		return t.AddDate(0, 0, n)
	case freqWeekly:
		return t.AddDate(0, 0, 7*n)
	case freqMonthly:
		return addMonths(t, n)
	case freqYearly:
		return addMonths(t, 12*n)
	}
	return t
}

// addMonths adds n months, clamping the day to the target month's length instead
// of rolling over. Go's AddDate would turn 31 jan + 1 month into 3 mar; for a
// monthly chore that silently shifts the whole series, so the last day of the
// month is the honest answer (28 feb, or 29 in a leap year).
func addMonths(t time.Time, n int) time.Time {
	y, m, d := t.Date()
	// Anchor on the first of the month so the addition itself can't overflow,
	// then put the day back, clamped.
	target := time.Date(y, m, 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location()).AddDate(0, n, 0)
	if last := daysInMonth(target.Year(), target.Month()); d > last {
		d = last
	}
	return time.Date(target.Year(), target.Month(), d, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}

// daysInMonth returns the length of a month — day 0 of the next one is the last
// day of this one.
func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
