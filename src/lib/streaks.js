// src/lib/streaks.js
// Streaks and "days done", plus the ONE shared fetch of completed days.
// Never copy any of this into a screen.

import { supabase } from '../supabaseClient'
import { isHabitDueOnDate, toDateString, daysSinceDate } from '../dateUtils'

const PAGE_SIZE = 1000 // Supabase returns at most 1000 rows per request

// Every completed day, for every habit, as { habit_id: Set of 'YYYY-MM-DD' }.
// Pages through the table, newest first. An unordered or unpaged fetch silently
// drops rows past 1000, and that would quietly shorten streaks.
export async function fetchCompletedDates() {
  const map = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('day_status')
      .select('habit_id, log_date')
      .eq('completed', true)
      .order('log_date', { ascending: false })
      .order('habit_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { error, map: {} }
    data.forEach((row) => {
      if (!map[row.habit_id]) map[row.habit_id] = new Set()
      map[row.habit_id].add(row.log_date)
    })
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { error: null, map }
}

// Consecutive DUE days completed, walking back from today.
// - Today not done yet doesn't break the streak.
// - A due day that wasn't completed does.
// - Days the habit isn't scheduled are skipped.
// - Open habits have no streak (null).
// - A backdated start date shows days-since instead (it clears itself in the
//   database the first time a due day is missed after it was set).
export function computeStreak(habit, completedDates, todayStr) {
  if (habit.completion_rule === 'open') return null
  if (habit.streak_start_date) return Math.max(0, daysSinceDate(habit.streak_start_date, todayStr))

  const cursor = new Date(todayStr + 'T00:00:00')
  let count = 0
  // The cap only protects against a habit with no due days at all.
  for (let i = 0; i < 3700; i++) {
    if (isHabitDueOnDate(habit, cursor)) {
      if (completedDates.has(toDateString(cursor))) count++
      else if (i > 0) break
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

// Due days completed in the period. Weeks start on Monday.
export function countDaysDone(habit, completedDates, period, todayStr) {
  let startStr = null
  if (period === 'week') {
    const d = new Date(todayStr + 'T00:00:00')
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    startStr = toDateString(d)
  } else if (period === 'month') {
    startStr = todayStr.slice(0, 8) + '01'
  }

  let n = 0
  completedDates.forEach((dateStr) => {
    if (dateStr > todayStr) return
    if (startStr && dateStr < startStr) return
    if (isHabitDueOnDate(habit, new Date(dateStr + 'T00:00:00'))) n++
  })
  return n
}

const PERIOD_TEXT = { week: 'this week', month: 'this month', all: 'all time' }

// "streak 5 · 18 days this month" (the streak part is left out at 0)
export function buildPeriodLine(habit, streak, daysDone) {
  const parts = []
  if (streak > 0) parts.push(`streak ${streak}`)
  parts.push(`${daysDone} ${daysDone === 1 ? 'day' : 'days'} ${PERIOD_TEXT[habit.show_period]}`)
  return parts.join(' · ')
}
