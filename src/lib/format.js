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
  if (habit.unit_format === 'h_m') return 'hours, e.g. 7.5 or 7:30'
  if (habit.unit_format === 'm_s') return 'seconds, e.g. 90 or 1:30'
  return habit.unit || 'amount'
}

// Minutes since midnight -> '12:30 pm' / '12 pm'. Wraps past 24h (a 1am entry plotted as 25h shows as 1 am).
export function formatClock(totalMinutes) {
  const m = Math.round(totalMinutes) % 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  const suffix = hh >= 12 ? 'pm' : 'am'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}

// Minutes since midnight -> 'HH:MM' for a time input box (wraps past 24h: 25:00 -> 01:00).
export function minutesToTimeInput(totalMinutes) {
  const m = Math.round(totalMinutes) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
