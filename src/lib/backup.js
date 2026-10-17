// src/lib/backup.js
// "Download backup": every table in one JSON file, saved to your device. This is a
// safety copy to keep somewhere, not an automatic sync (there is no restore button).

import { supabase } from '../supabaseClient'
import { getTodayDateString } from '../dateUtils'

const PAGE_SIZE = 1000 // Supabase returns at most 1000 rows per request

// Every table, with a full sort so paging can't skip or repeat a row.
const TABLES = [
  { name: 'habits', order: ['id'] },
  { name: 'habit_goals', order: ['id'] },
  { name: 'entries', order: ['log_date', 'entry_time', 'id'] },
  { name: 'day_status', order: ['log_date', 'habit_id'] },
  { name: 'app_prefs', order: ['id'] },
]

async function fetchAll(table, order) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*')
    order.forEach((col) => {
      query = query.order(col)
    })
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) return { error, rows: [] }
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return { error: null, rows }
}

export async function downloadBackup() {
  const tables = {}
  const counts = []
  for (const t of TABLES) {
    const { error, rows } = await fetchAll(t.name, t.order)
    if (error) return { error }
    tables[t.name] = rows
    counts.push(`${rows.length} ${t.name.replace('_', ' ')}`)
  }

  const file = JSON.stringify({ app: 'habit-tracker', exportedAt: new Date().toISOString(), tables }, null, 2)
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `habit-backup-${getTodayDateString()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return { error: null, counts: counts.join(', ') }
}
