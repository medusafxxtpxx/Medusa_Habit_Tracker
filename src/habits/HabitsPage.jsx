// src/habits/HabitsPage.jsx
// The daily screen: habits grouped by section, tick to complete, edit mode for
// adding / editing / reordering.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getTodayDateString, isHabitDueToday, isStreakOverrideBroken } from '../dateUtils'
import { goalForDate } from '../lib/goals'
import { recomputeDayStatus } from '../lib/completion'
import { fetchCompletedDates, computeStreak, countDaysDone, buildPeriodLine } from '../lib/streaks'
import HabitRow from './HabitRow'
import HabitEditForm from './HabitEditForm'
import './habits.css'

const COLLAPSE_KEY = 'habit-collapsed-sections'

// From the latest logged entries (newest first), the 3 most recent DIFFERENT
// amounts per habit, so they can be re-added with one tap, even on a new day.
// Looks at the newest 500 entries overall; plenty for a handful of habits.
function recentByHabit(rows) {
  const out = {}
  rows.forEach((r) => {
    if (!out[r.habit_id]) out[r.habit_id] = []
    const v = Number(r.value)
    if (out[r.habit_id].length < 3 && !out[r.habit_id].includes(v)) out[r.habit_id].push(v)
  })
  return out
}

// Sections in the order they first appear; habits inside sorted by order_index.
function groupBySection(list) {
  const sorted = [...list].sort((a, b) => a.order_index - b.order_index)
  const groups = []
  sorted.forEach((h) => {
    let g = groups.find((x) => x.section === h.section)
    if (!g) {
      g = { section: h.section, items: [] }
      groups.push(g)
    }
    g.items.push(h)
  })
  return groups
}

// "x of y done" ignores open (log-only) habits.
const counts = (h) => h.completion_rule !== 'open'

export default function HabitsPage() {
  const [habits, setHabits] = useState([])
  const [goals, setGoals] = useState([])
  const [doneMap, setDoneMap] = useState({}) // habit_id -> completed today
  const [entries, setEntries] = useState([]) // every entry logged today
  const [recent, setRecent] = useState({}) // habit_id -> 3 most recent different amounts
  const [completedMap, setCompletedMap] = useState({}) // habit_id -> Set of completed dates
  const prevGroupDone = useRef(null) // which groups were fully done last time
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState(null) // null | { habit: object | null }
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed))
  }, [collapsed])

  async function load() {
    const today = getTodayDateString()
    const [h, g, d, e, r, c] = await Promise.all([
      supabase.from('habits').select('*').order('order_index'),
      supabase.from('habit_goals').select('*'),
      supabase.from('day_status').select('habit_id, completed').eq('log_date', today),
      supabase.from('entries').select('*').eq('log_date', today).order('entry_time').order('created_at'),
      supabase.from('entries').select('habit_id, value').order('created_at', { ascending: false }).limit(500),
      fetchCompletedDates(),
    ])
    const failed = h.error || g.error || d.error || e.error || r.error || c.error
    if (failed) {
      setError(failed.message)
    } else {
      setError('')
      // A backdated streak lets go the first time a due day is missed after it was set.
      const stale = h.data.filter(
        (x) =>
          x.streak_start_date &&
          isStreakOverrideBroken(x, x.streak_override_set_date, c.map[x.id] || new Set(), today),
      )
      if (stale.length) {
        await Promise.all(
          stale.map((x) =>
            supabase
              .from('habits')
              .update({ streak_start_date: null, streak_override_set_date: null })
              .eq('id', x.id),
          ),
        )
        stale.forEach((x) => {
          x.streak_start_date = null
          x.streak_override_set_date = null
        })
      }
      setHabits(h.data)
      setCompletedMap(c.map)
      setGoals(g.data)
      setDoneMap(Object.fromEntries(d.data.map((r) => [r.habit_id, r.completed])))
      setEntries(e.data)
      setRecent(recentByHabit(r.data))
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const todayStr = getTodayDateString()
  const goalOf = (habit) => goalForDate(goals.filter((g) => g.habit_id === habit.id), todayStr)

  // Completed dates for streaks: the saved history, with today taken from the
  // live tick state so the streak updates the instant you tick.
  function datesFor(habit) {
    const set = new Set(completedMap[habit.id] || [])
    if (doneMap[habit.id]) set.add(todayStr)
    else set.delete(todayStr)
    return set
  }

  function streakInfo(habit) {
    if (habit.completion_rule === 'open') return { streak: null, periodLine: null }
    const dates = datesFor(habit)
    const streak = computeStreak(habit, dates, todayStr)
    const periodLine =
      habit.show_period === 'none'
        ? null
        : buildPeriodLine(habit, streak, countDaysDone(habit, dates, habit.show_period, todayStr))
    return { streak, periodLine }
  }

  // A group folds itself up the moment it BECOMES fully done (ticked by hand or
  // completed by the rules), but not just because it already was when you opened the page.
  useEffect(() => {
    if (loading || editMode) return
    const due = habits.filter((h) => h.active && isHabitDueToday(h) && counts(h))
    const sections = [...new Set(due.map((h) => h.section))]
    const nowDone = {}
    sections.forEach((sec) => {
      nowDone[sec] = due.filter((h) => h.section === sec).every((h) => doneMap[h.id])
    })
    const prev = prevGroupDone.current
    if (prev) {
      const newlyDone = sections.filter((sec) => nowDone[sec] && prev[sec] === false)
      if (newlyDone.length) setCollapsed((c) => [...new Set([...c, ...newlyDone])])
    }
    prevGroupDone.current = nowDone
  }, [habits, doneMap, editMode, loading])

  // Normal mode: active habits due today. Edit mode: everything.
  const visible = editMode ? habits : habits.filter((h) => h.active && isHabitDueToday(h))
  const groups = groupBySection(visible)
  const counted = visible.filter(counts)
  const doneCount = counted.filter((h) => doneMap[h.id]).length

  async function toggleDone(habit) {
    const next = !doneMap[habit.id]
    setDoneMap((prev) => ({ ...prev, [habit.id]: next }))

    const { error: err } = await supabase.from('day_status').upsert(
      { habit_id: habit.id, log_date: getTodayDateString(), completed: next },
      { onConflict: 'habit_id,log_date' },
    )
    if (err) {
      setDoneMap((prev) => ({ ...prev, [habit.id]: !next })) // undo
      setError(`could not save: ${err.message}`)
      return
    }
    setError('')
  }

  // ─── Completion rules (any entry / hits the goal) ──────────────────────────
  async function refreshDone() {
    const { data, error: err } = await supabase
      .from('day_status')
      .select('habit_id, completed')
      .eq('log_date', getTodayDateString())
    if (err) setError(`could not load ticks: ${err.message}`)
    else setDoneMap(Object.fromEntries(data.map((r) => [r.habit_id, r.completed])))
  }

  // After any entry change: re-run the habit's rule for today, then reload the ticks.
  async function syncCompletion(habitId) {
    const { error: err } = await recomputeDayStatus(habitId, getTodayDateString())
    if (err) setError(`could not update completion: ${err.message}`)
    await refreshDone()
  }

  // ─── Logging amounts (number + add_up habits) ──────────────────────────────
  async function refreshEntries() {
    const [today, latest] = await Promise.all([
      supabase
        .from('entries')
        .select('*')
        .eq('log_date', getTodayDateString())
        .order('entry_time')
        .order('created_at'),
      supabase.from('entries').select('habit_id, value').order('created_at', { ascending: false }).limit(500),
    ])
    const err = today.error || latest.error
    if (err) {
      setError(`could not load entries: ${err.message}`)
      return
    }
    setEntries(today.data)
    setRecent(recentByHabit(latest.data))
  }

  // add_up: every add is its own timestamped entry.
  async function addEntry(habit, value) {
    const { error: err } = await supabase.from('entries').insert({
      habit_id: habit.id,
      log_date: getTodayDateString(),
      entry_time: new Date().toTimeString().slice(0, 8), // local 'HH:MM:SS'
      value,
    })
    if (err) setError(`could not save: ${err.message}`)
    else setError('')
    await refreshEntries()
    await syncCompletion(habit.id)
  }

  async function removeEntry(entryId) {
    const entry = entries.find((x) => x.id === entryId)
    const { error: err } = await supabase.from('entries').delete().eq('id', entryId)
    if (err) setError(`could not remove: ${err.message}`)
    else setError('')
    await refreshEntries()
    if (entry) await syncCompletion(entry.habit_id)
  }

  // number: one value per day. Update the existing entry (so a failed save can't
  // lose the old value); otherwise insert the first one.
  async function saveNumber(habit, value) {
    const mine = entries.filter((x) => x.habit_id === habit.id)
    if (mine.length === 0) return addEntry(habit, value)
    const { error: err } = await supabase.from('entries').update({ value }).eq('id', mine[0].id)
    if (err) setError(`could not save: ${err.message}`)
    else setError('')
    await refreshEntries()
    await syncCompletion(habit.id)
  }

  // Swap within a section, then renumber EVERY habit 0..n so ties can't happen.
  async function moveHabit(habit, dir) {
    const all = groupBySection(habits)
    const group = all.find((g) => g.section === habit.section)
    const i = group.items.findIndex((h) => h.id === habit.id)
    const j = i + dir
    if (j < 0 || j >= group.items.length) return
    ;[group.items[i], group.items[j]] = [group.items[j], group.items[i]]

    const changed = all
      .flatMap((g) => g.items)
      .map((h, idx) => ({ id: h.id, order_index: idx, old: h.order_index }))
      .filter((x) => x.order_index !== x.old)

    const results = await Promise.all(
      changed.map((x) =>
        supabase.from('habits').update({ order_index: x.order_index }).eq('id', x.id),
      ),
    )
    const bad = results.find((r) => r.error)
    if (bad) setError(`could not reorder: ${bad.error.message}`)
    await load()
  }

  function toggleCollapsed(section) {
    setCollapsed((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    )
  }

  if (loading) return <div className="loading-state">loading habits...</div>

  const nextOrder = habits.length ? Math.max(...habits.map((h) => h.order_index)) + 1 : 0

  return (
    <div className="tab-page">
      <div className="habit-header">
        <div>
          <h1 className="page-title">today's habits</h1>
          <p className="page-sub">
            {counted.length === 0 ? 'nothing to do yet' : `${doneCount} of ${counted.length} done`}
          </p>
        </div>
        <button className="pill" onClick={() => setEditMode((v) => !v)}>
          {editMode ? 'done' : 'edit'}
        </button>
      </div>

      {error && <p className="error-state habit-error">{error}</p>}

      {editMode && (
        <button className="btn-primary habit-add" onClick={() => setEditing({ habit: null })}>
          + add habit
        </button>
      )}

      {groups.length === 0 && (
        <p className="loading-state">
          no habits yet. tap edit, then "add habit".
        </p>
      )}

      {groups.map((group) => {
        const groupCounted = group.items.filter(counts)
        const groupDone = groupCounted.filter((h) => doneMap[h.id]).length
        const isCollapsed = collapsed.includes(group.section) && !editMode
        return (
          <section key={group.section} className="habit-group">
            <button className="group-head" onClick={() => toggleCollapsed(group.section)}>
              <span className="section-label">{group.section}</span>
              <span className="group-count">
                {groupCounted.length > 0 && `${groupDone} of ${groupCounted.length} done `}
                {isCollapsed ? '▸' : '▾'}
              </span>
            </button>

            {!isCollapsed &&
              group.items.map((habit, idx) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  goal={goalOf(habit)}
                  done={!!doneMap[habit.id]}
                  entries={entries.filter((x) => x.habit_id === habit.id)}
                  recent={recent[habit.id] || []}
                  {...streakInfo(habit)}
                  editMode={editMode}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < group.items.length - 1}
                  onToggle={() => toggleDone(habit)}
                  onEdit={() => setEditing({ habit })}
                  onMove={(dir) => moveHabit(habit, dir)}
                  onAddEntry={(value) => addEntry(habit, value)}
                  onRemoveEntry={removeEntry}
                  onSaveNumber={(value) => saveNumber(habit, value)}
                />
              ))}
          </section>
        )
      })}

      {editing && (
        <HabitEditForm
          habit={editing.habit}
          goalRows={editing.habit ? goals.filter((g) => g.habit_id === editing.habit.id) : []}
          sections={[...new Set(habits.map((h) => h.section))]}
          nextOrder={nextOrder}
          onClose={() => setEditing(null)}
          onSaved={async (habitId) => {
            setEditing(null)
            // A changed rule or goal can change today's completion. Past days stay as they were.
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
