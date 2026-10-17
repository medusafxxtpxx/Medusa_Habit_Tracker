// src/lib/useAutoRefresh.js
// Keeps a screen current without a manual refresh. Calls `load` again when:
//   - the day rolls over (4am), checked once a minute while the app is open, and
//   - you come back to the app after a couple of minutes away (so a tick made on
//     your phone shows up on your laptop, and a left-open tab wakes up on the new day).
// Reloading only swaps the data; anything you're typing stays put.

import { useEffect, useRef } from 'react'
import { getTodayDateString } from '../dateUtils'

const STALE_MS = 2 * 60 * 1000
const DAY_CHECK_MS = 60 * 1000

export function useAutoRefresh(load) {
  const loadRef = useRef(load)
  loadRef.current = load // always the newest version of load
  const last = useRef({ day: getTodayDateString(), at: Date.now() })

  useEffect(() => {
    function run() {
      last.current = { day: getTodayDateString(), at: Date.now() }
      loadRef.current()
    }
    function onReturn() {
      if (document.visibilityState !== 'visible') return
      const dayChanged = getTodayDateString() !== last.current.day
      if (dayChanged || Date.now() - last.current.at > STALE_MS) run()
    }
    function onTimer() {
      if (getTodayDateString() !== last.current.day) run()
    }

    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    const timer = setInterval(onTimer, DAY_CHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
      clearInterval(timer)
    }
  }, [])
}
