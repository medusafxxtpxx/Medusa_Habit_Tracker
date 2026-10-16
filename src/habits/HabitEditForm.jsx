// src/habits/HabitEditForm.jsx
// The ONE form for every habit and check-in. Fields that don't apply to the
// chosen input type are hidden, never replaced by different fields.
// Note: "log time" (meals) is left out of the input types until phase 4.

import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { getTodayDateString, DAY_NAMES } from '../dateUtils'
import { goalForDate, saveGoal } from '../lib/goals'

const INPUT_TYPES = [['checkbox', 'checkbox'], ['number', 'number'], ['add_up', 'add up']]
const FORMATS = [['plain', 'plain'], ['h_m', 'hours:min'], ['m_s', 'min:sec']]
const RULES = [
  ['manual', 'I tick it'],
  ['any_entry', 'any entry'],
  ['hit_goal', 'hits the goal'],
  ['open', 'never (log only)'],
]
const RULE_HINTS = {
  manual: 'only your tick completes it. logging amounts never does.',
  any_entry: 'the first thing you log completes it.',
  hit_goal: 'completes once the day total reaches the goal. removing an entry can un-complete it.',
  open: 'logging only. no tick, no streak, left out of the done count.',
}
const PERIODS = [['none', 'none'], ['week', 'this week'], ['month', 'this month'], ['all', 'all time']]
const AGGS = [['total', 'total'], ['best', 'best'], ['average', 'average'], ['count', 'count'], ['latest', 'latest']]

const DEFAULTS = {
  name: '',
  emoji: '✨',
  section: 'daily essentials',
  input_type: 'checkbox',
  unit: '',
  unit_format: 'plain',
  quick_picks: '',
  completion_rule: 'manual',
  coloring: 'none',
  schedule_type: 'daily',
  schedule_days: [],
  streak_start_date: '',
  show_period: 'none',
  show_in_stats: true,
  graph_type: 'bar',
  graph_agg: 'total',
  graph_goal_line: true,
  graph_flip: false,
  active: true,
}

// Small row of tappable options. options = [[value, label], ...]
function Chips({ options, value, onChange, isDisabled }) {
  return (
    <div className="chip-row">
      {options.map(([val, label]) => {
        const off = isDisabled ? isDisabled(val) : false
        return (
          <button
            key={val}
            type="button"
            disabled={off}
            className={`chip ${value === val ? 'chip-on' : ''}`}
            onClick={() => onChange(val)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

const OnOff = ({ value, onChange }) => (
  <Chips options={[['on', 'on'], ['off', 'off']]} value={value ? 'on' : 'off'} onChange={(v) => onChange(v === 'on')} />
)

export default function HabitEditForm({ habit, goalRows, sections, nextOrder, onClose, onSaved }) {
  const today = getTodayDateString()
  const currentGoal = habit ? goalForDate(goalRows, today) : { direction: 'none', value: null }

  const [f, setF] = useState(() =>
    habit
      ? {
          ...DEFAULTS,
          ...habit,
          unit: habit.unit ?? '',
          quick_picks: (habit.quick_picks || []).join(', '),
          streak_start_date: habit.streak_start_date ?? '',
        }
      : DEFAULTS,
  )
  const [goalDir, setGoalDir] = useState(currentGoal.direction)
  const [goalValue, setGoalValue] = useState(currentGoal.value == null ? '' : String(Number(currentGoal.value)))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setF((prev) => ({ ...prev, [key]: val }))
  const isCheckbox = f.input_type === 'checkbox'
  const hasGoal = !isCheckbox && goalDir !== 'none'

  // "hits the goal" needs an at-least goal (an empty day would trivially pass an at-most one).
  const hitGoalAllowed = (dir, val) => dir === 'at_least' && val !== ''

  function changeGoal(dir, val) {
    setGoalDir(dir)
    setGoalValue(val)
    if (f.completion_rule === 'hit_goal' && !hitGoalAllowed(dir, val)) set('completion_rule', 'manual')
    if (dir === 'none') set('coloring', 'none')
  }

  function toggleDay(day) {
    const days = f.schedule_days.includes(day)
      ? f.schedule_days.filter((d) => d !== day)
      : [...f.schedule_days, day]
    set('schedule_days', days)
  }

  async function save() {
    setError('')
    if (!f.name.trim()) return setError('give it a name')

    let goalNum = null
    if (hasGoal) {
      goalNum = Number(goalValue)
      if (goalValue === '' || Number.isNaN(goalNum) || goalNum < 0) {
        return setError('enter a goal number, or choose "none"')
      }
    }
    if (f.schedule_type === 'specific_days' && f.schedule_days.length === 0) {
      return setError('pick at least one day, or choose "daily"')
    }

    const rule = isCheckbox ? 'manual' : f.completion_rule
    const quick = f.quick_picks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n > 0)

    // Backdated streak: set/changed -> remember the day you saved; cleared -> clear both.
    const streakAllowed = rule !== 'open'
    const newStart = streakAllowed && f.streak_start_date ? f.streak_start_date : null
    let overrideSet = habit?.streak_override_set_date ?? null
    if (newStart !== (habit?.streak_start_date ?? null)) overrideSet = newStart ? today : null
    if (!newStart) overrideSet = null

    const payload = {
      name: f.name.trim(),
      emoji: f.emoji.trim() || '✨',
      section: f.section.trim() || 'daily essentials',
      active: f.active,
      input_type: f.input_type,
      unit: isCheckbox ? null : f.unit.trim() || null,
      unit_format: isCheckbox ? 'plain' : f.unit_format,
      quick_picks: f.input_type === 'add_up' ? quick : [],
      completion_rule: rule,
      coloring: hasGoal ? f.coloring : 'none',
      schedule_type: f.schedule_type,
      schedule_days: f.schedule_type === 'specific_days' ? f.schedule_days : [],
      streak_start_date: newStart,
      streak_override_set_date: overrideSet,
      show_period: f.show_period,
      show_in_stats: f.show_in_stats,
      graph_type: f.graph_type,
      graph_agg: f.graph_agg,
      graph_goal_line: f.graph_goal_line,
      graph_flip: f.graph_flip,
    }

    setSaving(true)
    let habitId = habit?.id
    if (habit) {
      const { error: err } = await supabase.from('habits').update(payload).eq('id', habit.id)
      if (err) {
        setSaving(false)
        return setError(`could not save: ${err.message}`)
      }
    } else {
      const { data, error: err } = await supabase
        .from('habits')
        .insert({ ...payload, order_index: nextOrder, stats_order: nextOrder })
        .select()
        .single()
      if (err) {
        setSaving(false)
        return setError(`could not save: ${err.message}`)
      }
      habitId = data.id
    }

    if (!isCheckbox) {
      const { error: goalErr } = await saveGoal({
        habitId,
        existingRows: goalRows,
        direction: goalDir,
        value: goalNum,
      })
      if (goalErr) {
        setSaving(false)
        return setError(`habit saved, but the goal failed: ${goalErr.message}`)
      }
    }
    setSaving(false)
    onSaved(habitId) // the page re-runs today's completion rule for this habit
  }

  async function remove() {
    if (!window.confirm(`Delete "${habit.name}" and all its history? This can't be undone.`)) return
    const { error: err } = await supabase.from('habits').delete().eq('id', habit.id)
    if (err) return setError(`could not delete: ${err.message}`)
    onSaved()
  }

  const valueHint =
    f.unit_format === 'h_m' ? 'enter hours, e.g. 8 or 7.5' : f.unit_format === 'm_s' ? 'enter seconds, e.g. 90' : ''

  return (
    <div className="settings-overlay">
      <div className="settings-panel habit-sheet">
        <h2 className="page-title">{habit ? 'edit habit' : 'new habit'}</h2>
        <p className="page-sub">same form for every habit and check-in</p>

        <p className="field-label">name</p>
        <div className="form-row">
          <input className="input emoji-input" value={f.emoji} onChange={(e) => set('emoji', e.target.value)} />
          <input className="input" placeholder="pull-ups" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <p className="field-label">group</p>
        <input className="input" list="habit-sections" value={f.section} onChange={(e) => set('section', e.target.value)} />
        <datalist id="habit-sections">
          {sections.map((s) => <option key={s} value={s} />)}
        </datalist>

        <p className="field-label">how do you log it?</p>
        <Chips options={INPUT_TYPES} value={f.input_type} onChange={(v) => set('input_type', v)} />
        <p className="field-hint">
          {isCheckbox && 'checkbox: tap to mark done.'}
          {f.input_type === 'number' && "number: one value per day. saving replaces that day's value."}
          {f.input_type === 'add_up' && "add up: each entry is saved on its own and the day's total is the sum."}
        </p>

        {!isCheckbox && (
          <>
            <p className="field-label">unit (optional) and format</p>
            <input className="input" placeholder="reps, ml, h..." value={f.unit} onChange={(e) => set('unit', e.target.value)} />
            <div style={{ marginTop: 6 }}>
              <Chips options={FORMATS} value={f.unit_format} onChange={(v) => set('unit_format', v)} />
            </div>
          </>
        )}

        {f.input_type === 'add_up' && (
          <>
            <p className="field-label">quick-picks (one-tap amounts)</p>
            <input className="input" placeholder="3, 5, 10" value={f.quick_picks} onChange={(e) => set('quick_picks', e.target.value)} />
          </>
        )}

        {!isCheckbox && (
          <>
            <p className="field-label">goal</p>
            <div className="form-row">
              <Chips
                options={[['at_least', 'at least'], ['at_most', 'at most'], ['none', 'none']]}
                value={goalDir}
                onChange={(v) => changeGoal(v, goalValue)}
              />
              {goalDir !== 'none' && (
                <input
                  className="input goal-input"
                  type="number"
                  step="any"
                  min="0"
                  value={goalValue}
                  onChange={(e) => changeGoal(goalDir, e.target.value)}
                />
              )}
            </div>
            {goalDir !== 'none' && valueHint && <p className="field-hint">{valueHint}</p>}
            <p className="field-hint">changing a goal later only affects today onward; past days keep the goal they had.</p>

            <p className="field-label">how does it get completed?</p>
            <Chips
              options={RULES}
              value={f.completion_rule}
              onChange={(v) => set('completion_rule', v)}
              isDisabled={(v) => v === 'hit_goal' && !hitGoalAllowed(goalDir, goalValue)}
            />
            <p className="field-hint">
              {RULE_HINTS[f.completion_rule]}
              {!hitGoalAllowed(goalDir, goalValue) && ' ("hits the goal" needs an "at least" goal.)'}
            </p>
          </>
        )}

        {hasGoal && (
          <>
            <p className="field-label">coloring</p>
            <Chips options={[['none', 'none'], ['graded', 'graded']]} value={f.coloring} onChange={(v) => set('coloring', v)} />
          </>
        )}

        <p className="field-label">also show on the habit page (days done)</p>
        <Chips options={PERIODS} value={f.show_period} onChange={(v) => set('show_period', v)} />

        <p className="field-label">schedule</p>
        <Chips
          options={[['daily', 'daily'], ['specific_days', 'specific days']]}
          value={f.schedule_type}
          onChange={(v) => set('schedule_type', v)}
        />
        {f.schedule_type === 'specific_days' && (
          <div className="chip-row" style={{ marginTop: 6 }}>
            {DAY_NAMES.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${f.schedule_days.includes(d) ? 'chip-on' : ''}`}
                onClick={() => toggleDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {f.completion_rule !== 'open' && (
          <>
            <p className="field-label">backdate streak (optional)</p>
            <input className="input" type="date" value={f.streak_start_date} onChange={(e) => set('streak_start_date', e.target.value)} />
            <p className="field-hint">for a habit you were already doing before adding it here. clears itself if you miss a due day.</p>
          </>
        )}

        <p className="field-label">show in stats</p>
        <OnOff value={f.show_in_stats} onChange={(v) => set('show_in_stats', v)} />

        {f.show_in_stats && !isCheckbox && (
          <>
            <p className="field-label">chart type</p>
            <Chips options={[['bar', 'bar'], ['line', 'line']]} value={f.graph_type} onChange={(v) => set('graph_type', v)} />
            <p className="field-label">each day shows</p>
            <Chips options={AGGS} value={f.graph_agg} onChange={(v) => set('graph_agg', v)} />
            {hasGoal && (
              <>
                <p className="field-label">goal line</p>
                <OnOff value={f.graph_goal_line} onChange={(v) => set('graph_goal_line', v)} />
              </>
            )}
            <p className="field-label">lower numbers on top</p>
            <OnOff value={f.graph_flip} onChange={(v) => set('graph_flip', v)} />
            <p className="field-hint">so that up always means better, e.g. screen time. off by default.</p>
          </>
        )}

        <p className="field-label">active</p>
        <OnOff value={f.active} onChange={(v) => set('active', v)} />

        {error && <p className="error-state habit-error">{error}</p>}

        <div className="form-actions">
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'saving...' : 'save'}</button>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>cancel</button>
          {habit && <button className="btn-danger" onClick={remove} disabled={saving}>delete</button>}
        </div>
      </div>
    </div>
  )
}
