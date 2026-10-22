import type { ModelInfo, RunningModel } from '../../../shared/ollama'
import { formatBytes, formatRelativeTime } from '../../../shared/format'

interface Props {
  models: ModelInfo[]
  running: RunningModel[]
  selected: string | null
  onSelect: (name: string) => void
  onDelete?: (model: ModelInfo) => void
}

export function ModelList({ models, running, selected, onSelect, onDelete }: Props): React.JSX.Element {
  if (models.length === 0) {
    return (
      <div className="empty-models muted">
        No models installed yet.
        <br />
        Try installing <span className="mono">llama3.2</span>.
      </div>
    )
  }
  const loaded = new Set(running.map((m) => m.name))
  return (
    <ul className="model-list">
      {models.map((m) => (
        <li key={m.name} className={m.name === selected ? 'model selected' : 'model'}>
          <button className="model-main" onClick={() => onSelect(m.name)} title={m.name}>
            <span className="model-name">
              {m.name}
              {loaded.has(m.name) && <span className="badge">loaded</span>}
            </span>
            <span className="model-meta">
              {formatBytes(m.size)}
              {m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ''} · {formatRelativeTime(m.modified_at)}
            </span>
          </button>
          {onDelete && (
            <button className="icon-btn danger" title={`Uninstall ${m.name}`} onClick={() => onDelete(m)}>
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
