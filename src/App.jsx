// src/App.jsx
// Two tabs (habits, stats). Loads the saved palette from app_prefs on start.

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { applyPalette, DEFAULT_PALETTE } from './palettes'
import HabitsPage from './habits/HabitsPage'

export default function App() {
  const [tab, setTab] = useState('habits')

  useEffect(() => {
    async function loadPalette() {
      const { data, error } = await supabase
        .from('app_prefs')
        .select('palette')
        .eq('id', 1)
        .single()
      // A palette failure isn't fatal: fall back to the default look.
      applyPalette(error ? DEFAULT_PALETTE : data.palette)
    }
    loadPalette()
  }, [])

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
      </nav>

      {tab === 'habits' && <HabitsPage />}
      {tab === 'stats' && (
        <div className="tab-page">
          <h1 className="page-title">stats</h1>
          <p className="page-sub">stats page comes in phase 3</p>
        </div>
      )}
    </>
  )
}
