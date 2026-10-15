// src/lib/goals.js
// Goal history helpers. A habit's goal lives in habit_goals, one row per change.
// A day uses the row with the greatest effective_from <= that day, so changing a
// goal today never rewrites past days. This is the ONLY place that reads or
// writes goals; never keep a second copy of a goal anywhere else.

import { supabase } from '../supabaseClient'
import { getTodayDateString } from '../dateUtils'

const NO_GOAL = { direction: 'none', value: null }

// habitGoals: the habit_goals rows for ONE habit. dateStr: 'YYYY-MM-DD'.
// Date strings in that format compare correctly as plain strings.
export function goalForDate(habitGoals, dateStr) {
  let best = null
  for (const row of habitGoals) {
    if (row.effective_from <= dateStr && (!best || row.effective_from > best.effective_from)) {
      best = row
    }
  }
  return best ? { direction: best.direction, value: best.value } : NO_GOAL
}

// Saves a goal from the edit form. existingRows = this habit's current rows.
// First goal ever -> dated 1970-01-01 so it covers all days; later changes are
// dated today. Does nothing if the goal didn't change.
export async function saveGoal({ habitId, existingRows, direction, value }) {
  const today = getTodayDateString()
  const current = goalForDate(existingRows, today)

  const unchanged =
    current.direction === direction &&
    (direction === 'none' || Number(current.value) === Number(value))
  if (unchanged) return { error: null }

  // Never had a goal and still doesn't: no row needed.
  if (existingRows.length === 0 && direction === 'none') return { error: null }

  const effective_from = existingRows.length === 0 ? '1970-01-01' : today
  return supabase.from('habit_goals').upsert(
    {
      habit_id: habitId,
      effective_from,
      direction,
      value: direction === 'none' ? null : Number(value),
    },
    { onConflict: 'habit_id,effective_from' },
  )
}
