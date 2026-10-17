// src/App.jsx
// Two tabs (habits, stats) and the settings gear. Loads the saved palette on start.

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { applyPalette, DEFAULT_PALETTE } from './palettes'
import HabitsPage from './habits/HabitsPage'
import StatsPage from './stats/StatsPage'
import SettingsSheet from './settings/SettingsSheet'

export default function App() {
  const [tab, setTab] = useState('habits')
  const [palette, setPalette] = useState(DEFAULT_PALETTE)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    async function loadPalette() {
      const { data, error } = await supabase
        .from('app_prefs')
        .select('palette')
        .eq('id', 1)
        .single()
      // A palette failure isn't fatal: fall back to the default look.
      const key = error ? DEFAULT_PALETTE : data.palette
      setPalette(key)
      applyPalette(key)
    }
    loadPalette()
  }, [])

  // Switches the look right away, then saves it; if saving fails, switch back.
  async function choosePalette(key) {
    const previous = palette
    setPalette(key)
    applyPalette(key)
    const { error } = await supabase.from('app_prefs').update({ palette: key }).eq('id', 1)
    if (error) {
      setPalette(previous)
      applyPalette(previous)
      window.alert(`could not save the palette: ${error.message}`)
    }
  }

  return (
    <>
      <nav className="main-nav">
        <button
          className={`main-nav-btn ${tab === 'habits' ? 'main-nav-active' : ''}`}
          onClick={() => setTab('habits')}
        >
          habits
        </button>
        <button
          className={`main-nav-btn ${tab === 'stats' ? 'main-nav-active' : ''}`}
          onClick={() => setTab('stats')}
        >
          stats
        </button>
        <button className="main-nav-icon-btn" onClick={() => setShowSettings(true)} aria-label="settings">
          ⚙
        </button>
      </nav>

      {tab === 'habits' && <HabitsPage />}
      {tab === 'stats' && <StatsPage />}

      {showSettings && (
        <SettingsSheet palette={palette} onPalette={choosePalette} onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
