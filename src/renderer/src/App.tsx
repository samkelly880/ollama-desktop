import { useCallback, useEffect, useState } from 'react'
import type { ModelInfo, RunningModel } from '../../shared/ollama'
import { ModelList } from './components/ModelList'
import { OfflineNotice } from './components/OfflineNotice'
import { ChatView } from './components/ChatView'
import { useChat } from './useChat'
import { SettingsPanel } from './components/SettingsPanel'
import { useModelSettings } from './useModelSettings'
import { toChatOptions } from '../../shared/settings'

type Status = 'checking' | 'online' | 'offline'

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('checking')
  const [version, setVersion] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [running, setRunning] = useState<RunningModel[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const chat = useChat()
  const modelSettings = useModelSettings(selected)
  const [showSettings, setShowSettings] = useState(false)

  const refresh = useCallback(async () => {
    setChecking(true)
    const [v, m] = await Promise.all([window.api.ollama.version(), window.api.ollama.models()])
    setChecking(false)
    if (!v.ok || !m.ok) {
      setStatus('offline')
      setError(!v.ok ? v.error.message : !m.ok ? m.error.message : '')
      return
    }
    setStatus('online')
    setVersion(v.value)
    setModels(m.value.models)
    setRunning(m.value.running)
    setSelected((cur) =>
      cur && m.value.models.some((x) => x.name === cur) ? cur : (m.value.models[0]?.name ?? null)
    )
  }, [])

  useEffect(() => {
    void refresh()
    // Keep the list fresh (e.g. models pulled from the terminal) and auto-reconnect.
    const timer = setInterval(() => void refresh(), 15000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Ollama Desktop</div>
        <div className={`conn ${status}`}>
          <span className="dot" />
          {status === 'online' ? `Ollama ${version}` : status === 'offline' ? 'Not connected' : 'Connecting…'}
        </div>
      </header>

      {status === 'offline' ? (
        <OfflineNotice message={error} retrying={checking} onRetry={() => void refresh()} />
      ) : (
        <div className="layout">
          <aside className="sidebar">
            <div className="sidebar-header">
              <h3>Models</h3>
              <button className="icon-btn" title="Refresh" onClick={() => void refresh()} disabled={checking}>
                ↻
              </button>
            </div>
            <ModelList models={models} running={running} selected={selected} onSelect={setSelected} />
          </aside>
          <main className="main">
            <ChatView
              models={models}
              model={selected}
              onModelChange={setSelected}
              messages={chat.messages}
              streaming={chat.streaming}
              onSend={(text) =>
                selected &&
                void chat.send(text, selected, {
                  system: modelSettings.settings.systemPrompt,
                  options: toChatOptions(modelSettings.settings)
                })
              }
              onStop={chat.stop}
              onClear={chat.clear}
              toolbarExtra={
                <button
                  className={showSettings ? 'btn active' : 'btn ghost'}
                  onClick={() => setShowSettings((v) => !v)}
                  disabled={!selected}
                >
                  ⚙ Settings
                </button>
              }
            />
            {showSettings && selected && (
              <SettingsPanel
                model={selected}
                settings={modelSettings.settings}
                saveState={modelSettings.saveState}
                onChange={modelSettings.update}
                onReset={() => void modelSettings.reset()}
                onClose={() => setShowSettings(false)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  )
}
