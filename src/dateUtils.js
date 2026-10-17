// src/dateUtils.js
// Shared date + scheduling helpers. Every screen imports "today" from here so
// it is calculated once, the same way, everywhere. Never write local date logic.

export const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// The day rolls over at 4am, not midnight, so late-night use still counts as
// the day that's ending, not the new one.
export const DAY_BOUNDARY_HOUR = 4

// Returns a Date for the "effective" current moment: before the boundary hour
// this is shifted back one calendar day.
export function getEffectiveNow() {
  const now = new Date()
  if (now.getHours() < DAY_BOUNDARY_HOUR) {
    now.setDate(now.getDate() - 1)
  }
  return now
}

export function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getTodayDateString() {
  return toDateString(getEffectiveNow())
}

// 'YYYY-MM-DD' shifted by a number of days (negative = earlier).
export function shiftDateString(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return toDateString(d)
}

// Reads habit.schedule_type ('daily' | 'specific_days') and habit.schedule_days.
export function isHabitDueOnDate(habit, date) {
  if (habit.schedule_type === 'daily') return true
  if (habit.schedule_type === 'specific_days') {
    const dayName = DAY_NAMES[date.getDay()]
    const days = habit.schedule_days
    if (!days || !Array.isArray(days) || days.length === 0) return false
    return days.includes(dayName)
  }
  return true
}

export function isHabitDueToday(habit) {
  return isHabitDueOnDate(habit, getEffectiveNow())
}

// Whole days between a manually-set start date (habits.streak_start_date) and
// a given "today" string, for a habit that predates this app. The start date
// itself counts as day 0. This is pure date math: pair it with
// isStreakOverrideBroken() below before trusting the result.
export function daysSinceDate(startDateStr, todayStr) {
  if (!startDateStr) return null
  const start = new Date(startDateStr + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  return Math.floor((today - start) / (1000 * 60 * 60 * 24))
}

// Whether a backdated streak override has gone stale: a due day since it was
// SET (streak_override_set_date, the day you hit save, not the backdated
// start itself) and before today, with no completed day_status.
//
// It deliberately does NOT scan the backdated span (start date up to the day
// you set it): there are no logs for those days by definition, so scanning
// them would flag every override as broken the moment it's saved. Neither the
// set-date itself nor today is ever treated as a miss (both are still "in
// progress").
//
// Call this once per load; when it returns true, clear BOTH streak_start_date
// and streak_override_set_date in the database so every reader just sees nulls.
export function isStreakOverrideBroken(habit, overrideSetDate, completedDateSet, todayStr) {
  if (!overrideSetDate) return false
  const cursor = new Date(overrideSetDate + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  cursor.setDate(cursor.getDate() + 1)
  while (cursor < today) {
    const dateStr = toDateString(cursor)
    if (isHabitDueOnDate(habit, cursor) && !completedDateSet.has(dateStr)) {
      return true
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}
