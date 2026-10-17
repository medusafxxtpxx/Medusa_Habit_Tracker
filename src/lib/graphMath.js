// src/lib/graphMath.js
// The numbers behind the graphs: one value per day, goal checks, colors, axis size.

export const GREEN = '#639922'
export const AMBER = '#e0a83f'
export const RED = '#e0567e'

// One value for a day from that day's entries, using the habit's "each day shows".
// No entries -> null (the day is left empty, not drawn as zero).
export function aggregateDay(values, mode) {
  if (!values || values.length === 0) return null
  if (mode === 'best') return Math.max(...values)
  if (mode === 'count') return values.length
  if (mode === 'latest') return values[values.length - 1]
  const sum = values.reduce((a, b) => a + b, 0)
  return mode === 'average' ? sum / values.length : sum
}

export const hasGoal = (goal) => goal.direction !== 'none' && goal.value != null

// true / false against THAT day's goal, or null when the day has no goal or no value.
export function dayHit(goal, value) {
  if (value == null || !hasGoal(goal)) return null
  const g = Number(goal.value)
  return goal.direction === 'at_least' ? value >= g : value <= g
}

// Status color for graded habits; null means "use the plain accent color".
export function gradeColor(habit, goal, value) {
  if (habit.coloring !== 'graded' || value == null || !hasGoal(goal)) return null
  const g = Number(goal.value)
  if (goal.direction === 'at_least') return value >= g ? GREEN : value >= g * 0.6 ? AMBER : RED
  return value <= g ? GREEN : value <= g * 1.5 ? AMBER : RED
}

// A tidy top of the axis (1, 2, 3, 4, 5, 6, 8, 10 x a power of ten) so the
// three gridlines land on readable numbers.
export function niceMax(max) {
  if (!(max > 0)) return 1
  const padded = max * 1.08
  const exp = Math.floor(Math.log10(padded))
  const base = Math.pow(10, exp)
  const f = padded / base
  const step = [1, 2, 3, 4, 5, 6, 8, 10].find((s) => f <= s)
  return step * base
}

// 'HH:MM:SS' -> minutes on the app's 4am-to-4am day. Times before 4am belong to the
// day that is ending, so they count as past midnight (1:00 am -> 25:00) and a late
// bedtime plots next to 11 pm instead of at the far end of the chart.
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return (h < 4 ? h + 24 : h) * 60 + m
}

// Time goals (log-time habits). Goal values are minutes on the 4am-to-4am day, and
// a day is judged on its EARLIEST log. 'at_most' = no later than, 'at_least' = no earlier than.
// hit = on time, close = within 30 minutes of it, miss = further out.
export function timeGoalStatus(goal, minutes) {
  if (minutes == null || !hasGoal(goal)) return null
  const g = Number(goal.value)
  const off = goal.direction === 'at_most' ? minutes - g : g - minutes // minutes on the wrong side
  return off <= 0 ? 'hit' : off <= 30 ? 'close' : 'miss'
}

// Dot color for graded habits; null = the plain accent color.
export function timeGoalColor(habit, goal, minutes) {
  if (habit.coloring !== 'graded') return null
  const s = timeGoalStatus(goal, minutes)
  return s === 'hit' ? GREEN : s === 'close' ? AMBER : s === 'miss' ? RED : null
}
