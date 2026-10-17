// src/stats/TimeOfDayGraph.jsx
// Time-of-day chart for "log time" habits: one dot per log, at the time of day it
// happened. days = [{ dateStr, times: ['HH:MM:SS', ...], goal }], oldest first.
// Normal: later times are higher. "Lower numbers on top" (graph_flip) puts earlier times at the top.
// A time goal draws the dashed gold line (stepping with goal history); with graded
// coloring a day's dots are green / amber / red from its EARLIEST log.

import { formatClock } from '../lib/format'
import { timeToMinutes, hasGoal, timeGoalColor } from '../lib/graphMath'

const W = 400
const H = 150
const L = 58
const R = 8
const T = 14
const B = 24

export default function TimeOfDayGraph({ habit, days }) {
  const pw = W - L - R
  const ph = H - T - B
  const n = days.length
  const slot = pw / n
  const flip = habit.graph_flip

  const mins = days.flatMap((d) => d.times.map(timeToMinutes))
  const goalMins = habit.graph_goal_line ? days.filter((d) => hasGoal(d.goal)).map((d) => Number(d.goal.value)) : []
  const all = [...mins, ...goalMins]

  // Axis in whole hours with an hour of padding, never shorter than 6 hours; the goal time stays on the chart.
  let lo = all.length ? Math.floor(Math.min(...all) / 60) * 60 - 60 : 6 * 60
  let hi = all.length ? Math.ceil(Math.max(...all) / 60) * 60 + 60 : 22 * 60
  if (hi - lo < 360) {
    const mid = (lo + hi) / 2
    lo = Math.floor((mid - 180) / 60) * 60
    hi = lo + 360
  }
  const span = hi - lo

  const y = (m) => (flip ? T + ((m - lo) / span) * ph : T + ph - ((m - lo) / span) * ph)
  const x = (i) => L + slot * i + slot / 2
  const step = Math.ceil(n / 8)

  // Goal line: a flat piece per day joined by vertical steps, with gaps on days that had no goal.
  let goalPath = ''
  let prevY = null
  let lastGoalDay = null
  if (habit.graph_goal_line) {
    days.forEach((d, i) => {
      if (!hasGoal(d.goal)) {
        prevY = null
        return
      }
      const gy = y(Number(d.goal.value))
      const x0 = L + slot * i
      goalPath += prevY === null ? `M${x0},${gy}` : `L${x0},${gy}`
      goalPath += `L${x0 + slot},${gy}`
      prevY = gy
      lastGoalDay = d
    })
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={`${habit.name} time of day`}
    >
      {[lo, (lo + hi) / 2, hi].map((m) => (
        <g key={m}>
          <line x1={L} y1={y(m)} x2={W - R} y2={y(m)} style={{ stroke: 'var(--border)' }} strokeWidth="1" />
          <text x={L - 6} y={y(m) + 4} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-sub)' }}>
            {formatClock(m)}
          </text>
        </g>
      ))}

      {goalPath && (
        <>
          <path d={goalPath} fill="none" strokeWidth="1.5" strokeDasharray="5,4" style={{ stroke: 'var(--gold)' }} />
          <text
            x={W - R}
            y={y(Number(lastGoalDay.goal.value)) - 4}
            textAnchor="end"
            fontSize="10"
            style={{ fill: 'var(--gold)' }}
          >
            goal {formatClock(Number(lastGoalDay.goal.value))}
          </text>
        </>
      )}

      {days.map((d, i) => {
        const dayMins = d.times.map(timeToMinutes)
        const color = dayMins.length ? timeGoalColor(habit, d.goal, Math.min(...dayMins)) : null
        return dayMins.map((m, k) => (
          <circle
            key={`${d.dateStr}-${k}`}
            cx={x(i)}
            cy={y(m)}
            r="3.5"
            style={{ fill: color || 'var(--accent)' }}
          />
        ))
      })}

      {days.map((d, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={d.dateStr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-sub)' }}>
            {Number(d.dateStr.slice(8))}
          </text>
        ) : null,
      )}
    </svg>
  )
}
