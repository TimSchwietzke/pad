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
		{"daily", at(2026, time.March, 11), recurrenceRule{freqDaily, 1}, at(2026, time.March, 12)},
		{"every 3 days", at(2026, time.March, 11), recurrenceRule{freqDaily, 3}, at(2026, time.March, 14)},
		{"weekly", at(2026, time.March, 11), recurrenceRule{freqWeekly, 1}, at(2026, time.March, 18)},
		{"fortnightly", at(2026, time.March, 11), recurrenceRule{freqWeekly, 2}, at(2026, time.March, 25)},
		{"monthly", at(2026, time.March, 11), recurrenceRule{freqMonthly, 1}, at(2026, time.April, 11)},
		{"quarterly", at(2026, time.March, 11), recurrenceRule{freqMonthly, 3}, at(2026, time.June, 11)},
		{"yearly", at(2026, time.March, 11), recurrenceRule{freqYearly, 1}, at(2027, time.March, 11)},
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
	got := nextDue(from, recurrenceRule{freqWeekly, 1}, at(2026, time.March, 10))
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
		{"31 jan + 1 month", at(2026, time.January, 31), recurrenceRule{freqMonthly, 1}, at(2026, time.February, 28)},
		{"31 jan + 1 month, leap year", at(2028, time.January, 31), recurrenceRule{freqMonthly, 1}, at(2028, time.February, 29)},
		{"31 mar + 1 month", at(2026, time.March, 31), recurrenceRule{freqMonthly, 1}, at(2026, time.April, 30)},
		{"29 feb + 1 year", at(2028, time.February, 29), recurrenceRule{freqYearly, 1}, at(2029, time.February, 28)},
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
	got := nextDue(at(2026, time.February, 3), recurrenceRule{freqWeekly, 1}, now)
	if !got.After(now) {
		t.Fatalf("nextDue = %s, want a date after %s", got.Format(time.RFC3339), now.Format(time.RFC3339))
	}
	if want := at(2026, time.March, 17); !got.Equal(want) {
		t.Fatalf("nextDue = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
	}

	// a deadline already in the future advances exactly once, no catch-up
	if got := nextDue(at(2026, time.March, 20), recurrenceRule{freqWeekly, 1}, now); !got.Equal(at(2026, time.March, 27)) {
		t.Fatalf("future deadline advanced wrong: %s", got.Format(time.RFC3339))
	}
}

// TestRecurrenceValidation accepts the four cadences, defaults a missing interval
// to 1 and rejects everything else.
func TestRecurrenceValidation(t *testing.T) {
	valid := []recurrenceRule{
		{freqDaily, 1}, {freqWeekly, 2}, {freqMonthly, 6}, {freqYearly, 1},
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

	invalid := []recurrenceRule{
		{"hourly", 1}, {"", 1}, {freqDaily, -2},
	}
	for _, r := range invalid {
		if err := r.validate(); err == nil {
			t.Errorf("%+v: want a validation error", r)
		}
	}
}
