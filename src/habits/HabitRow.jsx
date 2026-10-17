// src/habits/HabitRow.jsx
// ONE component renders every habit, switching on input_type. Never make
// per-habit components.

import { useState } from 'react'
import { formatAmount, formatProgress, formatValue, formatTime, formatClock, inputPlaceholder } from '../lib/format'

export default function HabitRow({
  habit,
  goal,
  done,
  entries, // today's entries for THIS habit, oldest first
  recent, // the 3 most recent different amounts ever logged, newest first
  streak, // number of days, or null for open habits
  periodLine, // e.g. 'streak 5 · 18 days this month', or null
  folded, // true = the logging area (chips, amount box, quick-picks) is hidden
  onToggleFold,
  editMode,
  canMoveUp,
  canMoveDown,
  onToggle,
  onEdit,
  onMove,
  onAddEntry, // (value) => Promise, add_up
  onRemoveEntry, // (entryId) => Promise
  onSaveNumber, // (value) => Promise, number: replaces the day's value
}) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [timeVal, setTimeVal] = useState('') // a chosen time for "log time" habits

  const isOpen = habit.completion_rule === 'open' // log only: no tick, no streak
  // Only a manual tick (or a checkbox habit) can be tapped. "Any entry" and
  // "hits the goal" habits will fill in by themselves in phase 2.
  const tappable = habit.input_type === 'checkbox' || habit.completion_rule === 'manual'
  const logs = habit.input_type === 'number' || habit.input_type === 'add_up'
  // Hours and minutes boxes take plain text so you can type 7:30 (or 1:30 for min:sec) as well as 7.5.
  const textEntry = habit.unit_format === 'h_m' || habit.unit_format === 'm_s'
  const isTimeLog = habit.input_type === 'log_time' // records only WHEN

  const hasGoal = goal.direction !== 'none' && goal.value != null
  const goalNum = hasGoal ? Number(goal.value) : 0
  const total = entries.reduce((sum, e) => sum + Number(e.value), 0)
  const quickPicks = habit.quick_picks || []
  // Don't repeat an amount that is already a fixed quick-pick chip.
  const recentChips = recent.filter((v) => !quickPicks.includes(v))

  function progressText() {
    if (isTimeLog) {
      const goalText = hasGoal ? `${goal.direction === 'at_most' ? 'by' : 'after'} ${formatClock(goalNum)}` : null
      return [entries.length === 0 ? 'not logged yet' : null, goalText].filter(Boolean).join(' · ') || null
    }
    if (habit.input_type === 'number' && entries.length === 0) {
      return hasGoal ? `not logged · goal ${formatAmount(goalNum, habit)}` : 'not logged'
    }
    if (hasGoal) {
      const text = formatProgress(total, goalNum, habit)
      return goal.direction === 'at_most' ? `${text} max` : text
    }
    // No goal: only a plain running total makes sense (the entry chips show everything else).
    if (entries.length && habit.graph_agg === 'total') return formatAmount(total, habit)
    return null
  }

  async function run(fn) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  // '7.5' -> 7.5; with a colon: '7:30' -> 7.5 hours (hours:min), '1:30' -> 90 seconds (min:sec).
  function readAmount(text) {
    const t = text.trim()
    if (t === '') return null
    if (t.includes(':')) {
      const [a, b] = t.split(':').map(Number)
      if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0 || b >= 60) return null
      if (habit.unit_format === 'h_m') return a + b / 60
      if (habit.unit_format === 'm_s') return a * 60 + b
      return null
    }
    const n = Number(t)
    return Number.isNaN(n) ? null : n
  }

  function parsedAmount() {
    const n = readAmount(amount)
    if (n === null) return null
    if (habit.input_type === 'add_up' && n <= 0) return null
    if (n < 0) return null
    return n
  }

  function submit() {
    const n = parsedAmount()
    if (n === null) return
    run(async () => {
      if (habit.input_type === 'add_up') await onAddEntry(n)
      else await onSaveNumber(n)
      setAmount('')
    })
  }

  const text = !editMode && (logs || isTimeLog) ? progressText() : null
  const goalWords = isTimeLog
    ? goal.direction === 'at_most' ? 'no later than' : 'no earlier than'
    : goal.direction === 'at_least' ? 'at least' : 'at most'
  const editSummary =
    editMode && hasGoal
      ? `goal: ${goalWords} ${isTimeLog ? formatClock(goalNum) : formatAmount(goalNum, habit)}`
      : null
  const barPct = hasGoal && goalNum > 0 ? Math.min(100, (total / goalNum) * 100) : 0

  return (
    <div className={`card habit-card ${habit.active ? '' : 'habit-inactive'}`}>
      <div className="habit-row-main">
        <div className="habit-left">
          {!editMode && !isOpen && (
            <button
              className={`tick ${done ? 'tick-done' : ''} ${tappable ? '' : 'tick-static'}`}
              onClick={tappable ? onToggle : undefined}
              aria-label={done ? 'mark not done' : 'mark done'}
              disabled={!tappable}
            >
              {done ? '✓' : ''}
            </button>
          )}
          <span className="habit-emoji">{habit.emoji}</span>
          <div>
            <p className="habit-name">
              {habit.name}
              {!editMode && streak > 0 && <span className="streak-badge">🔥 {streak}</span>}
            </p>
            {text && <p className="habit-sub">{text}</p>}
            {!editMode && periodLine && <p className="habit-sub">{periodLine}</p>}
            {editSummary && <p className="habit-sub">{editSummary}</p>}
            {isOpen && !editMode && <p className="habit-sub">log only</p>}
            {!habit.active && editMode && <p className="habit-sub">inactive</p>}
          </div>
        </div>

        {editMode && (
          <div className="habit-controls">
            <button className="icon-btn" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="move up">↑</button>
            <button className="icon-btn" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="move down">↓</button>
            <button className="icon-btn" onClick={onEdit} aria-label="edit habit">✎</button>
          </div>
        )}

        {!editMode && (logs || isTimeLog) && (
          <button
            className="icon-btn"
            onClick={onToggleFold}
            aria-label={folded ? 'show logging' : 'hide logging'}
            aria-expanded={!folded}
          >
            {folded ? '▸' : '▾'}
          </button>
        )}
      </div>

      {/* The progress bar stays visible when folded, so you still see how far along you are. */}
      {!editMode && logs && hasGoal && goalNum > 0 && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${barPct}%` }} />
        </div>
      )}

      {!editMode && logs && !folded && (
        <>
          {habit.input_type === 'add_up' && entries.length > 0 && (
            <div className="chip-row log-chips">
              {entries.map((e) => (
                <span key={e.id} className="entry-chip">
                  {formatTime(e.entry_time)} · {formatValue(e.value, habit)}
                  <button
                    className="entry-x"
                    aria-label="remove this entry"
                    disabled={busy}
                    onClick={() => run(() => onRemoveEntry(e.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="log-input-row">
            <input
              className="input"
              type={textEntry ? 'text' : 'number'}
              inputMode={textEntry ? undefined : 'decimal'}
              min={textEntry ? undefined : '0'}
              step={textEntry ? undefined : 'any'}
              placeholder={inputPlaceholder(habit)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button className="btn-primary log-btn" disabled={busy} onClick={submit}>
              {habit.input_type === 'add_up' ? 'add' : 'save'}
            </button>
            {habit.input_type === 'number' && entries.length > 0 && (
              <button
                className="btn-ghost log-btn"
                disabled={busy}
                onClick={() => run(() => onRemoveEntry(entries[0].id))}
              >
                clear
              </button>
            )}
          </div>

          {habit.input_type === 'add_up' && (quickPicks.length > 0 || recentChips.length > 0) && (
            <div className="chip-row log-chips">
              {quickPicks.map((n) => (
                <button key={`q${n}`} className="chip" disabled={busy} onClick={() => run(() => onAddEntry(n))}>
                  {formatValue(n, habit)}
                </button>
              ))}
              {recentChips.map((n) => (
                <button
                  key={`r${n}`}
                  className="chip"
                  disabled={busy}
                  title="add this amount again"
                  onClick={() => run(() => onAddEntry(n))}
                >
                  ↻ {formatValue(n, habit)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {!editMode && isTimeLog && !folded && (
        <>
          {entries.length > 0 && (
            <div className="chip-row log-chips">
              {entries.map((e) => (
                <span key={e.id} className="entry-chip">
                  {formatTime(e.entry_time)}
                  <button
                    className="entry-x"
                    aria-label="remove this time"
                    disabled={busy}
                    onClick={() => run(() => onRemoveEntry(e.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="log-input-row">
            <button className="btn-primary log-btn" disabled={busy} onClick={() => run(() => onAddEntry(1))}>
              log now
            </button>
            <input
              className="input"
              type="time"
              aria-label="log a different time"
              value={timeVal}
              onChange={(e) => setTimeVal(e.target.value)}
            />
            <button
              className="btn-ghost log-btn"
              disabled={busy || !timeVal}
              onClick={() =>
                run(async () => {
                  await onAddEntry(1, timeVal.length === 5 ? `${timeVal}:00` : timeVal)
                  setTimeVal('')
                })
              }
            >
              add
            </button>
          </div>
        </>
      )}
    </div>
  )
}
