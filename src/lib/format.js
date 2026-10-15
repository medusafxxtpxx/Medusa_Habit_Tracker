// src/lib/format.js
// Turns stored numbers into text. Values are stored in base units: decimal
// hours for "h_m", seconds for "m_s", otherwise the plain number. Every screen
// formats through here so a habit looks the same everywhere.

const num = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

// Just the amount, without the unit word: 1,400 | 7h 30m | 1:30
export function formatValue(value, habit) {
  const v = Number(value)
  if (habit.unit_format === 'h_m') {
    const totalMin = Math.round(v * 60)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h === 0) return `${m}m`
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  if (habit.unit_format === 'm_s') {
    const s = Math.round(v)
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  return num(v)
}

// Amount plus the unit word when it has one: 1,400 ml | 7h 30m
export function formatAmount(value, habit) {
  const base = formatValue(value, habit)
  return habit.unit_format === 'plain' && habit.unit ? `${base} ${habit.unit}` : base
}

// "1,400 / 2,000 ml" (unit shown once, at the end, for plain habits)
export function formatProgress(total, goal, habit) {
  const unit = habit.unit_format === 'plain' && habit.unit ? ` ${habit.unit}` : ''
  return `${formatValue(total, habit)} / ${formatValue(goal, habit)}${unit}`
}

// 'HH:MM:SS' -> '9:14 am'
export function formatTime(timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number)
  const suffix = hh >= 12 ? 'pm' : 'am'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}

// What to type in the amount box (the box always takes hours or seconds for those formats).
export function inputPlaceholder(habit) {
  if (habit.unit_format === 'h_m') return 'hours, e.g. 7.5'
  if (habit.unit_format === 'm_s') return 'seconds, e.g. 90'
  return habit.unit || 'amount'
}
