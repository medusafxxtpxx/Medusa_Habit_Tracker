// src/habits/HabitRow.jsx
// ONE component renders every habit, switching on input_type. Never make
// per-habit components.

import { useState } from 'react'
import { formatAmount, formatProgress, formatValue, formatTime, inputPlaceholder } from '../lib/format'

export default function HabitRow({
  habit,
  goal,
  done,
  entries, // today's entries for THIS habit, oldest first
  recent, // the 3 most recent different amounts ever logged, newest first
  streak, // number of days, or null for open habits
  periodLine, // e.g. 'streak 5 · 18 days this month', or null
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

  const isOpen = habit.completion_rule === 'open' // log only: no tick, no streak
  // Only a manual tick (or a checkbox habit) can be tapped. "Any entry" and
  // "hits the goal" habits will fill in by themselves in phase 2.
  const tappable = habit.input_type === 'checkbox' || habit.completion_rule === 'manual'
  const logs = habit.input_type === 'number' || habit.input_type === 'add_up'

  const hasGoal = goal.direction !== 'none' && goal.value != null
  const goalNum = hasGoal ? Number(goal.value) : 0
  const total = entries.reduce((sum, e) => sum + Number(e.value), 0)
  const quickPicks = habit.quick_picks || []
  // Don't repeat an amount that is already a fixed quick-pick chip.
  const recentChips = recent.filter((v) => !quickPicks.includes(v))

  function progressText() {
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

  function parsedAmount() {
    if (amount.trim() === '') return null
    const n = Number(amount)
    if (Number.isNaN(n)) return null
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

  const text = !editMode && logs ? progressText() : null
  const editSummary =
    editMode && hasGoal
      ? `goal: ${goal.direction === 'at_least' ? 'at least' : 'at most'} ${formatAmount(goalNum, habit)}`
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
      </div>

      {!editMode && logs && (
        <>
          {hasGoal && goalNum > 0 && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${barPct}%` }} />
            </div>
          )}

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
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
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
    </div>
  )
}
