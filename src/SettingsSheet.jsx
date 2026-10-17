// src/settings/SettingsSheet.jsx
// The gear sheet: pick a color palette and download a backup.

import { useState } from 'react'
import { PALETTES } from '../palettes'
import { downloadBackup } from '../lib/backup'
import '../habits/habits.css'

export default function SettingsSheet({ palette, onPalette, onClose }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function backup() {
    setBusy(true)
    setStatus('preparing your backup...')
    const { error, counts } = await downloadBackup()
    setBusy(false)
    setStatus(error ? `backup failed: ${error.message}` : `saved: ${counts}`)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="page-title">settings</h2>

        <p className="field-label">color palette</p>
        <div className="palette-swatch-row">
          {Object.entries(PALETTES).map(([key, p]) => (
            <button
              key={key}
              className={`palette-swatch ${palette === key ? 'palette-swatch-active' : ''}`}
              style={{ background: p.swatch }}
              title={p.label}
              aria-label={p.label}
              onClick={() => onPalette(key)}
            />
          ))}
        </div>

        <p className="field-label">backup</p>
        <button className="btn-ghost" onClick={backup} disabled={busy}>
          download backup
        </button>
        <p className="field-hint">
          saves all your habits, goals, entries and ticks as one file on this device. keep it somewhere safe.
        </p>
        {status && <p className="field-hint">{status}</p>}

        <button className="btn-ghost settings-close" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
