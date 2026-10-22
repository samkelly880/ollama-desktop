import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, isDefaultSettings, LIMITS, type ModelSettings } from '../../../shared/settings'
import type { SaveState } from '../useModelSettings'

interface Props {
  model: string
  settings: ModelSettings
  saveState: SaveState
  onChange: (patch: Partial<ModelSettings>) => void
  onReset: () => void
  onClose: () => void
}

export function SettingsPanel({ model, settings, saveState, onChange, onReset, onClose }: Props): React.JSX.Element {
  // Keep the context-length box as free text while typing; commit valid numbers only.
  const [ctxText, setCtxText] = useState(settings.numCtx?.toString() ?? '')
  useEffect(() => setCtxText(settings.numCtx?.toString() ?? ''), [settings.numCtx])

  return (
    <aside className="settings" aria-label="Model settings">
      <div className="sidebar-header" style={{ padding: 0 }}>
        <h3>Settings</h3>
        <button className="icon-btn" onClick={onClose} title="Close settings">
          ✕
        </button>
      </div>
      <div className="hint">
        Saved for <span className="mono">{model}</span> and remembered next time.
      </div>

      <div className="field">
        <label htmlFor="temperature">
          Temperature <span className="value">{settings.temperature.toFixed(2)}</span>
        </label>
        <input
          id="temperature"
          type="range"
          min={LIMITS.temperature.min}
          max={LIMITS.temperature.max}
          step={0.05}
          value={settings.temperature}
          onChange={(e) => onChange({ temperature: Number(e.target.value) })}
        />
        <div className="hint">Lower = focused and repeatable. Higher = more creative. Default {DEFAULT_SETTINGS.temperature}.</div>
      </div>

      <div className="field">
        <label htmlFor="top_p">
          Top P <span className="value">{settings.topP.toFixed(2)}</span>
        </label>
        <input
          id="top_p"
          type="range"
          min={LIMITS.topP.min}
          max={LIMITS.topP.max}
          step={0.05}
          value={settings.topP}
          onChange={(e) => onChange({ topP: Number(e.target.value) })}
        />
        <div className="hint">Only consider the most likely words adding up to this share. Default {DEFAULT_SETTINGS.topP}.</div>
      </div>

      <div className="field">
        <label htmlFor="num_ctx">Context length (tokens)</label>
        <input
          id="num_ctx"
          type="number"
          min={LIMITS.numCtx.min}
          step={1024}
          placeholder="Model default"
          value={ctxText}
          onChange={(e) => {
            setCtxText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value === '') onChange({ numCtx: null })
            else if (Number.isFinite(n) && n >= LIMITS.numCtx.min) onChange({ numCtx: n })
          }}
        />
        <div className="hint">How much of the conversation the model can see. Bigger uses more memory. Leave empty for the default.</div>
      </div>

      <div className="field">
        <label htmlFor="system">System prompt</label>
        <textarea
          id="system"
          placeholder="e.g. You are a concise assistant. Answer in British English."
          value={settings.systemPrompt}
          maxLength={LIMITS.systemPromptMaxLength}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
        />
        <div className="hint">Instructions sent before every chat with this model.</div>
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={onReset} disabled={isDefaultSettings(settings)}>
          Reset to defaults
        </button>
        <span className="saved">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Could not save' : ''}
        </span>
      </div>
    </aside>
  )
}
