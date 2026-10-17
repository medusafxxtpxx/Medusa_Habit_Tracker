// src/stats/StatsPage.jsx
// One graph at a time. Pills choose the habit; the pencil on the card opens the
// SAME edit form as the habit page, so there is only one place graph settings live.

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getTodayDateString, shiftDateString, isHabitDueOnDate } from '../dateUtils'
import { goalForDate } from '../lib/goals'
import { recomputeDayStatus } from '../lib/completion'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { fetchCompletedDates, fetchEntriesSince, computeStreak, bestStreak, countDaysDone } from '../lib/streaks'
import { formatAmount, formatClock } from '../lib/format'
import { aggregateDay, dayHit, hasGoal, timeToMinutes, timeGoalStatus } from '../lib/graphMath'
import HabitGraph from './HabitGraph'
import TimeOfDayGraph from './TimeOfDayGraph'
import HabitEditForm from '../habits/HabitEditForm'
import '../habits/habits.css'
import './stats.css'

const SELECTED_KEY = 'stats-selected-habit'
const RANGES = [7, 14, 30, 'month'] // 'month' = the 1st through today

export default function StatsPage() {
  const [habits, setHabits] = useState([])
  const [goals, setGoals] = useState([])
  const [completedMap, setCompletedMap] = useState({})
  const [entriesByHabit, setEntriesByHabit] = useState({})
  const [timesByHabit, setTimesByHabit] = useState({}) // entry times, for log-time habits
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_KEY))
  const [range, setRange] = useState(14)
  const [editPills, setEditPills] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // habit being edited, or null

  const todayStr = getTodayDateString()

  async function load() {
    const today = getTodayDateString()
    // Far enough back for the longest range AND this month's total.
    const monthStart = today.slice(0, 8) + '01'
    const rangeStart = shiftDateString(today, -29)
    const since = monthStart < rangeStart ? monthStart : rangeStart

    const [h, g, c, e] = await Promise.all([
      supabase.from('habits').select('*').order('stats_order').order('order_index'),
      supabase.from('habit_goals').select('*'),
      fetchCompletedDates(),
      fetchEntriesSince(since),
    ])
    const failed = h.error || g.error || c.error || e.error
    if (failed) {
      setError(failed.message)
    } else {
      setError('')
      setHabits(h.data)
      setGoals(g.data)
      setCompletedMap(c.map)
      setEntriesByHabit(e.byHabit)
      setTimesByHabit(e.timesByHabit)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useAutoRefresh(load) // new day or coming back to the app -> reload

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId)
  }, [selectedId])

  const onStats = habits.filter((h) => h.show_in_stats) // already ordered by stats_order
  const notOnStats = habits.filter((h) => !h.show_in_stats)
  const habit = onStats.find((h) => h.id === selectedId) || onStats[0] || null

  // ─── Pills ────────────────────────────────────────────────────────────────
  async function movePill(h, dir) {
    const i = onStats.findIndex((x) => x.id === h.id)
    const j = i + dir
    if (j < 0 || j >= onStats.length) return
    const next = [...onStats]
    ;[next[i], next[j]] = [next[j], next[i]]
    // Renumber the whole row so ties can't happen.
    const changed = next.map((x, idx) => ({ id: x.id, idx, old: x.stats_order })).filter((x) => x.idx !== x.old)
    const results = await Promise.all(
      changed.map((x) => supabase.from('habits').update({ stats_order: x.idx }).eq('id', x.id)),
    )
    const bad = results.find((r) => r.error)
    if (bad) setError(`could not reorder: ${bad.error.message}`)
    await load()
  }

  // Removing only hides the graph; the habit and all its data are kept.
  async function removePill(h) {
    const { error: err } = await supabase.from('habits').update({ show_in_stats: false }).eq('id', h.id)
    if (err) setError(`could not remove: ${err.message}`)
    await load()
  }

  async function addPill(h) {
    const nextOrder = onStats.length ? Math.max(...onStats.map((x) => x.stats_order)) + 1 : 0
    const { error: err } = await supabase
      .from('habits')
      .update({ show_in_stats: true, stats_order: nextOrder })
      .eq('id', h.id)
    if (err) setError(`could not add: ${err.message}`)
    else setSelectedId(h.id)
    setAdding(false)
    await load()
  }

  if (loading) return <div className="loading-state">loading stats...</div>

  // ─── Numbers for the selected habit ───────────────────────────────────────
  let card = null
  if (habit) {
    const goalRows = goals.filter((g) => g.habit_id === habit.id)
    const completed = completedMap[habit.id] || new Set()
    const byDate = entriesByHabit[habit.id] || {}
    const dayCount = range === 'month' ? Number(todayStr.slice(8)) : range
    const dates = Array.from({ length: dayCount }, (_, i) => shiftDateString(todayStr, -(dayCount - 1 - i)))
    const isOpen = habit.completion_rule === 'open'
    const isCheckbox = habit.input_type === 'checkbox'

    const streakNow = isOpen ? null : computeStreak(habit, completed, todayStr)
    // A backdated streak can be longer than any run of real ticks, so "best" is never below "now".
    const streakBest = isOpen ? null : Math.max(bestStreak(habit, completed, todayStr), streakNow)
    const daysThisMonth = isOpen ? null : countDaysDone(habit, completed, 'month', todayStr)

    const header = (right) => (
      <div className="stats-card-head">
        <p className="stats-title">{habit.emoji} {habit.name}</p>
        <div className="stats-head-right">
          {right && <span className="stats-sub">{right}</span>}
          <button className="icon-btn" aria-label="edit this habit and graph" onClick={() => setEditing(habit)}>✎</button>
        </div>
      </div>
    )

    const rangeChips = (
      <div className="chip-row stats-range">
        {RANGES.map((n) => (
          <button key={n} className={`chip ${range === n ? 'chip-on' : ''}`} onClick={() => setRange(n)}>
            {n === 'month' ? 'this month' : `${n} days`}
          </button>
        ))}
      </div>
    )

    if (isCheckbox) {
      const due = dates.filter((d) => isHabitDueOnDate(habit, new Date(d + 'T00:00:00')))
      const done = due.filter((d) => completed.has(d)).length
      const rate = due.length ? Math.round((done / due.length) * 100) : 0
      card = (
        <div className="card">
          {header(`${done} of ${due.length} days`)}
          {rangeChips}
          <div className="done-grid">
            {dates.map((d) => {
              const isDue = isHabitDueOnDate(habit, new Date(d + 'T00:00:00'))
              const isDone = completed.has(d)
              return (
                <span key={d} className={`sq ${isDone ? 'sq-done' : ''} ${isDue ? '' : 'sq-off'}`}>
                  {Number(d.slice(8))}
                </span>
              )
            })}
          </div>
          <div className="tile-row">
            <Tile label="done rate" value={`${rate}%`} />
            <Tile label="streak" value={dayText(streakNow)} />
            <Tile label="best streak" value={dayText(streakBest)} />
          </div>
          <div className="tile-row">
            <Tile label="days done this month" value={String(daysThisMonth)} />
          </div>
        </div>
      )
    } else if (habit.input_type === 'log_time') {
      const timesFor = timesByHabit[habit.id] || {}
      const days = dates.map((d) => ({ dateStr: d, times: timesFor[d] || [], goal: goalForDate(goalRows, d) }))
      const minutes = days.flatMap((d) => d.times.map(timeToMinutes))
      const loggedDays = days.filter((d) => d.times.length > 0).length
      const avgMin = minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : null
      const clock = (m) => (m == null ? '--' : formatClock(m))
      // Hit rate: each day's EARLIEST log against that day's own goal time; days without a goal are left out.
      const judged = days.filter((d) => d.times.length > 0 && hasGoal(d.goal))
      const hits = judged.filter(
        (d) => timeGoalStatus(d.goal, Math.min(...d.times.map(timeToMinutes))) === 'hit',
      ).length
      const logHitRate = judged.length ? `${Math.round((hits / judged.length) * 100)}%` : '--'
      const logAnyGoal = days.some((d) => hasGoal(d.goal))
      card = (
        <div className="card">
          {header(`${loggedDays} of ${dayCount} days`)}
          {rangeChips}
          <TimeOfDayGraph habit={habit} days={days} />
          {minutes.length === 0 && <p className="stats-sub stats-empty">nothing logged in this range</p>}
          <div className="tile-row">
            <Tile label="typical time" value={clock(avgMin)} />
            <Tile label="earliest" value={clock(minutes.length ? Math.min(...minutes) : null)} />
            <Tile label="latest" value={clock(minutes.length ? Math.max(...minutes) : null)} />
          </div>
          <div className="tile-row">
            {logAnyGoal ? <Tile label="hit rate" value={logHitRate} /> : <Tile label="days logged" value={String(loggedDays)} />}
            {!isOpen && <Tile label="days done this month" value={String(daysThisMonth)} />}
            {!isOpen && <Tile label="best streak ever" value={dayText(streakBest)} />}
          </div>
        </div>
      )
    } else {
      const days = dates.map((d) => ({
        dateStr: d,
        value: aggregateDay(byDate[d], habit.graph_agg),
        goal: goalForDate(goalRows, d),
      }))
      const withValue = days.filter((d) => d.value != null)
      const avg = withValue.length ? withValue.reduce((a, d) => a + d.value, 0) / withValue.length : null

      // Hit rate: each day judged against its OWN goal; days without a goal are left out.
      const judged = withValue.filter((d) => hasGoal(d.goal))
      const hits = judged.filter((d) => dayHit(d.goal, d.value)).length
      const hitRate = judged.length ? `${Math.round((hits / judged.length) * 100)}%` : '--'
      const anyGoal = days.some((d) => hasGoal(d.goal))

      // "Best" means lowest when the most recent goal is "at most".
      const lastGoal = [...days].reverse().find((d) => hasGoal(d.goal))
      const lowIsBest = lastGoal && lastGoal.goal.direction === 'at_most'
      const best = withValue.length
        ? (lowIsBest ? Math.min : Math.max)(...withValue.map((d) => d.value))
        : null

      const today = days[days.length - 1].value

      const monthStart = todayStr.slice(0, 8) + '01'
      const monthTotal = Object.entries(byDate)
        .filter(([d]) => d >= monthStart)
        .reduce((sum, [, vals]) => sum + vals.reduce((a, b) => a + b, 0), 0)

      card = (
        <div className="card">
          {header(avg == null ? null : `avg ${show(habit, avg)}`)}
          {rangeChips}
          <HabitGraph habit={habit} days={days} />
          {withValue.length === 0 && <p className="stats-sub stats-empty">nothing logged in this range</p>}
          <div className="tile-row">
            <Tile label={anyGoal ? 'hit rate' : 'logged days'} value={anyGoal ? hitRate : String(withValue.length)} />
            <Tile label="best day" value={show(habit, best)} />
            <Tile label="today" value={show(habit, today)} />
          </div>
          {(!isOpen || habit.graph_agg === 'total') && (
            <div className="tile-row">
              {!isOpen && <Tile label="days done this month" value={String(daysThisMonth)} />}
              {!isOpen && <Tile label="best streak ever" value={dayText(streakBest)} />}
              {habit.graph_agg === 'total' && <Tile label="this month" value={formatAmount(monthTotal, habit)} />}
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div className="tab-page">
      <div className="habit-header">
        <div>
          <h1 className="page-title">stats</h1>
        </div>
        <button className="pill" onClick={() => setEditPills((v) => !v)}>
          {editPills ? 'done' : 'edit pills'}
        </button>
      </div>

      {error && <p className="error-state habit-error">{error}</p>}

      <div className="chip-row">
        {onStats.map((h, i) =>
          editPills ? (
            <span key={h.id} className="pill-edit">
              <button className="mini-btn" disabled={i === 0} onClick={() => movePill(h, -1)} aria-label="move left">‹</button>
              <button className={`chip ${habit && h.id === habit.id ? 'chip-on' : ''}`} onClick={() => setSelectedId(h.id)}>
                {h.name}
              </button>
              <button className="mini-btn" disabled={i === onStats.length - 1} onClick={() => movePill(h, 1)} aria-label="move right">›</button>
              <button className="mini-btn" onClick={() => removePill(h)} aria-label="remove graph">×</button>
            </span>
          ) : (
            <button key={h.id} className={`chip ${habit && h.id === habit.id ? 'chip-on' : ''}`} onClick={() => setSelectedId(h.id)}>
              {h.name}
            </button>
          ),
        )}
        <button className="chip" onClick={() => setAdding((v) => !v)}>+ add graph</button>
      </div>

      {editPills && (
        <p className="field-hint">move pills with the arrows, or remove one from stats. removing keeps your data.</p>
      )}

      {adding && (
        <div className="stats-add">
          {notOnStats.length === 0 ? (
            <p className="field-hint">every habit is already on stats.</p>
          ) : (
            <>
              <p className="field-hint">habits not on stats yet</p>
              <div className="chip-row">
                {notOnStats.map((h) => (
                  <button key={h.id} className="chip" onClick={() => addPill(h)}>{h.name}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {card || <p className="loading-state">no graphs yet. tap "+ add graph".</p>}
      </div>

      {editing && (
        <HabitEditForm
          habit={editing}
          goalRows={goals.filter((g) => g.habit_id === editing.id)}
          sections={[...new Set(habits.map((h) => h.section))]}
          nextOrder={0}
          onClose={() => setEditing(null)}
          onSaved={async (habitId) => {
            setEditing(null)
            if (habitId) {
              const { error: err } = await recomputeDayStatus(habitId, getTodayDateString())
              if (err) setError(`could not update completion: ${err.message}`)
            }
            await load()
          }}
        />
      )}
    </div>
  )
}

function Tile({ label, value }) {
  return (
    <div className="tile">
      <p className="tile-label">{label}</p>
      <p className="tile-value">{value}</p>
    </div>
  )
}

const dayText = (n) => (n == null ? '--' : `${n} ${n === 1 ? 'day' : 'days'}`)

// A day's value with its unit; "--" when there is nothing.
function show(habit, v) {
  if (v == null) return '--'
  if (habit.graph_agg === 'count') return `${v} ${v === 1 ? 'entry' : 'entries'}`
  return formatAmount(v, habit)
}
