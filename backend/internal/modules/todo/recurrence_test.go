package todo

import (
	"testing"
	"time"
)

// at builds a local date at 09:00, the time of day the assertions below carry along.
func at(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 9, 0, 0, 0, time.UTC)
}

// TestNextDueCadences walks each cadence one interval forward from a deadline
// that is still in the future, so no catch-up kicks in.
func TestNextDueCadences(t *testing.T) {
	now := at(2026, time.March, 10)

	cases := []struct {
		name string
		from time.Time
		rule recurrenceRule
		want time.Time
	}{
		{"daily", at(2026, time.March, 11), recurrenceRule{Freq: freqDaily, Interval: 1}, at(2026, time.March, 12)},
		{"every 3 days", at(2026, time.March, 11), recurrenceRule{Freq: freqDaily, Interval: 3}, at(2026, time.March, 14)},
		{"weekly", at(2026, time.March, 11), recurrenceRule{Freq: freqWeekly, Interval: 1}, at(2026, time.March, 18)},
		{"fortnightly", at(2026, time.March, 11), recurrenceRule{Freq: freqWeekly, Interval: 2}, at(2026, time.March, 25)},
		{"monthly", at(2026, time.March, 11), recurrenceRule{Freq: freqMonthly, Interval: 1}, at(2026, time.April, 11)},
		{"quarterly", at(2026, time.March, 11), recurrenceRule{Freq: freqMonthly, Interval: 3}, at(2026, time.June, 11)},
		{"yearly", at(2026, time.March, 11), recurrenceRule{Freq: freqYearly, Interval: 1}, at(2027, time.March, 11)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := nextDue(c.from, c.rule, now); !got.Equal(c.want) {
				t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), c.want.Format(time.RFC3339))
			}
		})
	}
}

// TestNextDueKeepsTimeOfDay makes sure an evening chore stays an evening chore.
func TestNextDueKeepsTimeOfDay(t *testing.T) {
	from := time.Date(2026, time.March, 11, 18, 30, 0, 0, time.UTC)
	got := nextDue(from, recurrenceRule{Freq: freqWeekly, Interval: 1}, at(2026, time.March, 10))
	if got.Hour() != 18 || got.Minute() != 30 {
		t.Fatalf("time of day lost: %s", got.Format(time.RFC3339))
	}
}

// TestNextDueClampsShortMonths pins the month arithmetic: adding a month to the
// 31st must land on the last day of the target month, not roll into the next one.
func TestNextDueClampsShortMonths(t *testing.T) {
	cases := []struct {
		name string
		from time.Time
		rule recurrenceRule
		want time.Time
	}{
		{"31 jan + 1 month", at(2026, time.January, 31), recurrenceRule{Freq: freqMonthly, Interval: 1}, at(2026, time.February, 28)},
		{"31 jan + 1 month, leap year", at(2028, time.January, 31), recurrenceRule{Freq: freqMonthly, Interval: 1}, at(2028, time.February, 29)},
		{"31 mar + 1 month", at(2026, time.March, 31), recurrenceRule{Freq: freqMonthly, Interval: 1}, at(2026, time.April, 30)},
		{"29 feb + 1 year", at(2028, time.February, 29), recurrenceRule{Freq: freqYearly, Interval: 1}, at(2029, time.February, 28)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// "now" sits just before the source date so no catch-up interferes
			got := nextDue(c.from, c.rule, c.from.Add(-time.Hour))
			if !got.Equal(c.want) {
				t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), c.want.Format(time.RFC3339))
			}
		})
	}
}

// TestNextDueCatchesUp is the point of the loop in nextDue: a chore left alone
// for weeks comes back due *next* time, not still overdue.
func TestNextDueCatchesUp(t *testing.T) {
	now := at(2026, time.March, 10)

	// weekly, last due five weeks ago -> the first friday after today
	got := nextDue(at(2026, time.February, 3), recurrenceRule{Freq: freqWeekly, Interval: 1}, now)
	if !got.After(now) {
		t.Fatalf("nextDue = %s, want a date after %s", got.Format(time.RFC3339), now.Format(time.RFC3339))
	}
	if want := at(2026, time.March, 17); !got.Equal(want) {
		t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
	}

	// a deadline already in the future advances exactly once, no catch-up
	if got := nextDue(at(2026, time.March, 20), recurrenceRule{Freq: freqWeekly, Interval: 1}, now); !got.Equal(at(2026, time.March, 27)) {
		t.Fatalf("future deadline advanced wrong: %s", got.Format(time.RFC3339))
	}
}

// TestNextDueWeekdays walks a "every mon + thu" rule around the week, including
// the wrap from the last selected day back to the first of the next week.
func TestNextDueWeekdays(t *testing.T) {
	// 2026: 2 mar is a monday, so the week runs mon 2 … sun 8 march
	monThu := recurrenceRule{Freq: freqWeekly, Interval: 1, Weekdays: []int32{1, 4}}
	early := at(2026, time.March, 1) // the sunday before, so nothing is "now"-blocked

	cases := []struct {
		name string
		from time.Time
		want time.Time
	}{
		{"monday to thursday", at(2026, time.March, 2), at(2026, time.March, 5)},
		{"thursday wraps to next monday", at(2026, time.March, 5), at(2026, time.March, 9)},
		{"a day in between picks the next selected one", at(2026, time.March, 3), at(2026, time.March, 5)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := nextDue(c.from, monThu, early); !got.Equal(c.want) {
				t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), c.want.Format(time.RFC3339))
			}
		})
	}
}

// TestNextDueWeekdaysEveryOtherWeek pins the interval on top of the weekdays:
// the weeks in between are skipped rather than the series drifting a day.
func TestNextDueWeekdaysEveryOtherWeek(t *testing.T) {
	rule := recurrenceRule{Freq: freqWeekly, Interval: 2, Weekdays: []int32{1, 4}}
	early := at(2026, time.March, 1)

	// mon 2 mar -> thu 5 mar (same week, still in the interval)
	if got := nextDue(at(2026, time.March, 2), rule, early); !got.Equal(at(2026, time.March, 5)) {
		t.Fatalf("same week: %s", got.Format(time.RFC3339))
	}
	// thu 5 mar -> mon 16 mar, skipping the week of 9 march entirely
	if got := nextDue(at(2026, time.March, 5), rule, early); !got.Equal(at(2026, time.March, 16)) {
		t.Fatalf("next interval week: %s, want 16 mar", got.Format(time.RFC3339))
	}
}

// TestNextDueWeekdaysCatchUp: an ignored weekday rule also comes back in the
// future rather than repeating an overdue date.
func TestNextDueWeekdaysCatchUp(t *testing.T) {
	rule := recurrenceRule{Freq: freqWeekly, Interval: 1, Weekdays: []int32{1, 4}}
	now := at(2026, time.March, 10) // a tuesday
	got := nextDue(at(2026, time.February, 2), rule, now)
	if !got.After(now) {
		t.Fatalf("nextDue = %s, want a date after %s", got.Format(time.RFC3339), now.Format(time.RFC3339))
	}
	if want := at(2026, time.March, 12); !got.Equal(want) { // the thursday after
		t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
	}
}

// TestRecurrenceValidation accepts the four cadences, defaults a missing interval
// to 1 and rejects everything else.
func TestRecurrenceValidation(t *testing.T) {
	valid := []recurrenceRule{
		{Freq: freqDaily, Interval: 1},
		{Freq: freqWeekly, Interval: 2},
		{Freq: freqMonthly, Interval: 6},
		{Freq: freqYearly, Interval: 1},
		// a weekly rule pinned to weekdays
		{Freq: freqWeekly, Interval: 1, Weekdays: []int32{1, 4}},
	}
	for _, r := range valid {
		if err := r.validate(); err != nil {
			t.Errorf("%+v: unexpected error %v", r, err)
		}
	}

	// an omitted interval reads as "every one"
	r := recurrenceRule{Freq: freqWeekly}
	if err := r.validate(); err != nil || r.Interval != 1 {
		t.Errorf("missing interval: err=%v interval=%d, want nil/1", err, r.Interval)
	}

	three := int32(3)
	past := time.Now()
	invalid := []recurrenceRule{
		{Freq: "hourly", Interval: 1},
		{Freq: "", Interval: 1},
		{Freq: freqDaily, Interval: -2},
		// weekdays only make sense for a weekly cadence
		{Freq: freqMonthly, Interval: 1, Weekdays: []int32{1}},
		{Freq: freqWeekly, Interval: 1, Weekdays: []int32{0}},
		{Freq: freqWeekly, Interval: 1, Weekdays: []int32{8}},
		// an end date and a countdown are mutually exclusive
		{Freq: freqWeekly, Interval: 1, Until: &past, Count: &three},
	}
	for _, r := range invalid {
		if err := r.validate(); err == nil {
			t.Errorf("%+v: want a validation error", r)
		}
	}
}
