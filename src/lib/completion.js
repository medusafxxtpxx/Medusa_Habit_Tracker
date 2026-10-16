// src/lib/completion.js
// Keeps day_status in step with the entries for habits that complete
// themselves. This is the ONLY place that decides "completed" from entries.
//
//   manual    -> never touched here (only the user's tick changes day_status)
//   open      -> never completes
//   any_entry -> completed when the day has at least one entry
//   hit_goal  -> completed when the day's total reaches the goal for THAT day
//                (always the sum of entries; the single value for number habits)
//
// It reads fresh data from the database each time, so it can't work from stale
// screen state. Past days are never recomputed, so changing a goal later
// doesn't rewrite history.

import { supabase } from '../supabaseClient'
import { goalForDate } from './goals'

export async function recomputeDayStatus(habitId, dateStr) {
  const [h, g, e] = await Promise.all([
    supabase.from('habits').select('id, completion_rule').eq('id', habitId).single(),
    supabase.from('habit_goals').select('*').eq('habit_id', habitId),
    supabase.from('entries').select('value').eq('habit_id', habitId).eq('log_date', dateStr),
  ])
  const failed = h.error || g.error || e.error
  if (failed) return { error: failed }

  const rule = h.data.completion_rule
  if (rule !== 'any_entry' && rule !== 'hit_goal') return { error: null }

  let completed = false
  if (rule === 'any_entry') {
    completed = e.data.length > 0
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
