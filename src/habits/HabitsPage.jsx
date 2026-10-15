// src/habits/HabitsPage.jsx
// The daily screen: habits grouped by section, tick to complete, edit mode for
// adding / editing / reordering.

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getTodayDateString, isHabitDueToday } from '../dateUtils'
import { goalForDate } from '../lib/goals'
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
    const [h, g, d, e, r] = await Promise.all([
      supabase.from('habits').select('*').order('order_index'),
      supabase.from('habit_goals').select('*'),
      supabase.from('day_status').select('habit_id, completed').eq('log_date', today),
      supabase.from('entries').select('*').eq('log_date', today).order('entry_time').order('created_at'),
      supabase.from('entries').select('habit_id, value').order('created_at', { ascending: false }).limit(500),
    ])
    const failed = h.error || g.error || d.error || e.error || r.error
    if (failed) {
      setError(failed.message)
    } else {
      setError('')
      setHabits(h.data)
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

  const goalOf = (habit) =>
    goalForDate(goals.filter((g) => g.habit_id === habit.id), getTodayDateString())

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

    // A group collapses by itself when its last habit gets done.
    if (next) {
      const mates = visible.filter((h) => h.section === habit.section && counts(h))
      const allDone = mates.every((h) => (h.id === habit.id ? true : doneMap[h.id]))
      if (allDone && !collapsed.includes(habit.section)) {
        setCollapsed((prev) => [...prev, habit.section])
      }
    }
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
  }

  async function removeEntry(entryId) {
    const { error: err } = await supabase.from('entries').delete().eq('id', entryId)
    if (err) setError(`could not remove: ${err.message}`)
    else setError('')
    await refreshEntries()
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
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
