package todo

import (
	"errors"
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

// recurrenceRule is the repeat cadence of a todo: every `Interval` units of `Freq`.
type recurrenceRule struct {
	Freq     string `json:"freq"`
	Interval int32  `json:"interval"`
}

// validate rejects an unknown cadence or a non-positive interval. An interval of
// 0 is read as "not given" and becomes 1, so `{"freq":"weekly"}` just works.
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
	return nil
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
	next := from
	for i := 0; i < maxAdvanceSteps; i++ {
		next = advance(next, rule)
		if next.After(notBefore) {
			break
		}
	}
	return next
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
