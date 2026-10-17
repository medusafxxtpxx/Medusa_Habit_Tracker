// src/lib/completion.js
// Keeps day_status in step with the entries for habits that complete
// themselves. This is the ONLY place that decides "completed" from entries.
//
//   manual    -> never touched here (only the user's tick changes day_status)
//   open      -> never completes
//   any_entry -> completed when the day has at least one entry
//   hit_goal  -> completed when the day's total reaches the goal for THAT day
//                (always the sum of entries; the single value for number habits).
//                For log-time habits: when the day's EARLIEST log meets the goal time
//                (no later than / no earlier than).
//
// It reads fresh data from the database each time, so it can't work from stale
// screen state. Past days are never recomputed, so changing a goal later
// doesn't rewrite history.

import { supabase } from '../supabaseClient'
import { goalForDate } from './goals'
import { timeToMinutes } from './graphMath'
import { getTodayDateString, shiftDateString, isHabitDueOnDate, toDateString } from '../dateUtils'

export async function recomputeDayStatus(habitId, dateStr) {
  const [h, g, e] = await Promise.all([
    supabase.from('habits').select('id, completion_rule, input_type').eq('id', habitId).single(),
    supabase.from('habit_goals').select('*').eq('habit_id', habitId),
    supabase.from('entries').select('value, entry_time').eq('habit_id', habitId).eq('log_date', dateStr),
  ])
  const failed = h.error || g.error || e.error
  if (failed) return { error: failed }

  const rule = h.data.completion_rule
  if (rule !== 'any_entry' && rule !== 'hit_goal') return { error: null }

  let completed = false
  if (rule === 'any_entry') {
    completed = e.data.length > 0
  } else if (h.data.input_type === 'log_time') {
    const goal = goalForDate(g.data, dateStr)
    if (goal.direction !== 'none' && goal.value != null && e.data.length > 0) {
      const first = Math.min(...e.data.map((row) => timeToMinutes(row.entry_time)))
      completed = goal.direction === 'at_most' ? first <= Number(goal.value) : first >= Number(goal.value)
    }
  } else {
    const goal = goalForDate(g.data, dateStr)
    const total = e.data.reduce((sum, row) => sum + Number(row.value), 0)
    // hit_goal only makes sense with an at-least goal (the form enforces it too).
    completed = goal.direction === 'at_least' && goal.value != null && total >= Number(goal.value)
  }

  return supabase
    .from('day_status')
    .upsert({ habit_id: habitId, log_date: dateStr, completed }, { onConflict: 'habit_id,log_date' })
}

// Backdating: marks every scheduled day from startDateStr up to YESTERDAY as done,
// as real day_status records, so the grid, done rate, days done and streaks all
// agree. Today is left for the user to tick. Days that already have a record
// are never changed (ignoreDuplicates), and nothing is ever deleted.
// schedule = { schedule_type, schedule_days } of the habit.
export async function backfillCompleted(habitId, schedule, startDateStr) {
  const end = new Date(shiftDateString(getTodayDateString(), -1) + 'T00:00:00')
  const cursor = new Date(startDateStr + 'T00:00:00')
  const rows = []
  let guard = 0
  while (cursor <= end) {
    if (guard++ > 3700) return { error: new Error('that date is more than 10 years back') }
    if (isHabitDueOnDate(schedule, cursor)) {
      rows.push({ habit_id: habitId, log_date: toDateString(cursor), completed: true })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  // In chunks, so a long history doesn't go up as one huge request.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('day_status')
      .upsert(rows.slice(i, i + 500), { onConflict: 'habit_id,log_date', ignoreDuplicates: true })
    if (error) return { error }
  }
  return { error: null }
}
