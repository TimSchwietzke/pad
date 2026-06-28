import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api/health'

/** Color/shape family. Each preset ships its own light and dark values. */
type Preset = 'standard' | 'google'
/** Light or dark, orthogonal to the preset. */
type Mode = 'light' | 'dark'

/**
 * Root of the pad shell.
 *
 * Slice 0 only needs to prove two things end to end: that the frontend can
 * actually talk to the backend (the health card), and that the theming system
 * works (the preset/mode switches). The real feature widgets drop into the main
 * area in later slices.
 */
export default function App() {
  const [preset, setPreset] = useState<Preset>('standard')
  const [mode, setMode] = useState<Mode>('light')

  // The whole theme is driven by two data attributes on <html>. Flipping them
  // is all we do here — the CSS variables in tokens.scss repaint the rest. No
  // component knows which theme is active, which is what keeps adding a new one
  // cheap.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.preset = preset
    root.dataset.mode = mode
  }, [preset, mode])

  // React Query handles the loading / error / data states and the refetch.
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__brand">pad</span>
        <div className="app__controls">
          <div className="seg" role="group" aria-label="Preset">
            <button className={preset === 'standard' ? 'is-active' : ''} onClick={() => setPreset('standard')}>
              Standard
            </button>
            <button className={preset === 'google' ? 'is-active' : ''} onClick={() => setPreset('google')}>
              Google
            </button>
          </div>
          <div className="seg" role="group" aria-label="Modus">
            <button className={mode === 'light' ? 'is-active' : ''} onClick={() => setMode('light')}>
              Hell
            </button>
            <button className={mode === 'dark' ? 'is-active' : ''} onClick={() => setMode('dark')}>
              Dunkel
            </button>
          </div>
        </div>
      </header>

      <main className="app__main">
        <section className="card">
          <h2 className="card__title">Backend-Verbindung</h2>
          {/* Three mutually exclusive states straight from the query. */}
          {health.isPending && <p className="muted">Prüfe …</p>}
          {health.isError && (
            <p className="status status--error">Nicht erreichbar — läuft das Backend auf :8080?</p>
          )}
          {health.data && (
            <>
              <p className="status status--ok">
                {health.data.status} · {health.data.service}
              </p>
              <p className="muted">Angemeldet als {health.data.user ?? '—'}</p>
            </>
          )}
          {/* void: we don't care about the returned promise, just trigger it. */}
          <button className="btn btn--primary" onClick={() => void health.refetch()}>
            Erneut prüfen
          </button>
        </section>
      </main>
    </div>
  )
}
