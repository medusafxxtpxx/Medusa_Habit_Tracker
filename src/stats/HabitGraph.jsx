// src/stats/HabitGraph.jsx
// Hand-rolled SVG chart for ONE habit. days = [{ dateStr, value (or null), goal }],
// oldest first. Bars or line, dashed gold goal line that steps where the goal
// changed, and the "lower numbers on top" switch (graph_flip).

import { formatAmount } from '../lib/format'
import { gradeColor, hasGoal, niceMax } from '../lib/graphMath'

const W = 400
const H = 150
const L = 58 // room on the left for tick labels with units
const R = 8
const T = 14
const B = 24

export default function HabitGraph({ habit, days }) {
  const pw = W - L - R
  const ph = H - T - B
  const n = days.length
  const slot = pw / n
  const flip = habit.graph_flip
  const isBar = habit.graph_type === 'bar'

  const nums = days.filter((d) => d.value != null).map((d) => d.value)
  const goalVals = habit.graph_goal_line ? days.filter((d) => hasGoal(d.goal)).map((d) => Number(d.goal.value)) : []
  const mx = niceMax(Math.max(0, ...nums, ...goalVals))

  // Normal: 0 at the bottom. Flipped: 0 at the top, so lower values sit higher.
  const y = (v) => (flip ? T + (v / mx) * ph : T + ph - (v / mx) * ph)
  const x = (i) => L + slot * i + slot / 2
  const tick = (v) => (habit.graph_agg === 'count' ? String(Math.round(v * 10) / 10) : formatAmount(v, habit))

  // Goal line: one flat piece per day, joined by vertical steps, with gaps on days that had no goal.
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

  const points = days
    .map((d, i) => (d.value == null ? null : `${x(i)},${y(d.value)}`))
    .filter(Boolean)
    .join(' ')

  const step = Math.ceil(n / 8)
  const colorOf = (d) => gradeColor(habit, d.goal, d.value)
  const plain = { fill: 'var(--accent)' }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={`${habit.name} graph`}
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={L} y1={y(mx * t)} x2={W - R} y2={y(mx * t)} style={{ stroke: 'var(--border)' }} strokeWidth="1" />
          <text x={L - 6} y={y(mx * t) + 4} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-sub)' }}>
            {tick(mx * t)}
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
            goal {formatAmount(Number(lastGoalDay.goal.value), habit)}
          </text>
        </>
      )}

      {isBar &&
        days.map((d, i) => {
          if (d.value == null) return null
          const bh = (d.value / mx) * ph
          const color = colorOf(d)
          return (
            <rect
              key={d.dateStr}
              x={x(i) - slot * 0.3}
              y={flip ? T : T + ph - bh}
              width={slot * 0.6}
              height={bh}
              rx="2"
              style={color ? { fill: color } : plain}
            />
          )
        })}

      {!isBar && (
        <>
          <polyline points={points} fill="none" strokeWidth="1.5" opacity="0.7" style={{ stroke: 'var(--accent-muted)' }} />
          {days.map((d, i) => {
            if (d.value == null) return null
            const color = colorOf(d)
            return <circle key={d.dateStr} cx={x(i)} cy={y(d.value)} r="3.5" style={color ? { fill: color } : plain} />
          })}
        </>
      )}

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
