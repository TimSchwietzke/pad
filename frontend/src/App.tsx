import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api/health'

type Preset = 'standard' | 'google'
type Mode = 'light' | 'dark'

export default function App() {
  const [preset, setPreset] = useState<Preset>('standard')
  const [mode, setMode] = useState<Mode>('light')

  // Theme is purely token-driven: flip data attributes, CSS variables do the rest.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.preset = preset
    root.dataset.mode = mode
  }, [preset, mode])

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
          <button className="btn btn--primary" onClick={() => void health.refetch()}>
            Erneut prüfen
          </button>
        </section>
      </main>
    </div>
  )
}
