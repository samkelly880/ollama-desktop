import { useRef, useState } from 'react'
import type { StreamHandle } from '../../../shared/api'
import { INITIAL_PULL_STATE, reducePull, type PullState } from '../../../shared/ollama'
import { formatBytes } from '../../../shared/format'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  installed: string[]
  onInstalled: (name: string) => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm'; name: string }
  | { kind: 'pulling'; name: string; progress: PullState }
  | { kind: 'done'; name: string; size: number }
  | { kind: 'error'; name: string; message: string }

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/:]*$/

function friendlyError(name: string, message: string): string {
  if (/file does not exist|not found/i.test(message)) {
    return `"${name}" wasn't found in the Ollama library. Check the spelling (e.g. llama3.2, qwen2.5:7b) at ollama.com/library.`
  }
  return message
}

/** Install a model by name with a confirmation step and a live progress bar. */
export function InstallModel({ installed, onInstalled }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const handleRef = useRef<StreamHandle | null>(null)

  const trimmed = name.trim()
  const valid = MODEL_NAME.test(trimmed) && trimmed.length <= 200
  const alreadyInstalled =
    installed.includes(trimmed) || (!trimmed.includes(':') && installed.includes(`${trimmed}:latest`))
  const busy = phase.kind === 'pulling'

  const start = async (model: string): Promise<void> => {
    setPhase({ kind: 'pulling', name: model, progress: INITIAL_PULL_STATE })
    let state = INITIAL_PULL_STATE
    const handle = window.api.ollama.pull(model, (event) => {
      state = reducePull(state, event)
      setPhase({ kind: 'pulling', name: model, progress: state })
    })
    handleRef.current = handle
    const end = await handle.done
    handleRef.current = null
    if (!end.error) {
      setPhase({ kind: 'done', name: model, size: state.total })
      setName('')
      onInstalled(model)
    } else if (end.error.kind === 'aborted') {
      setPhase({ kind: 'idle' })
    } else {
      setPhase({ kind: 'error', name: model, message: friendlyError(model, end.error.message) })
    }
  }

  return (
    <div className="install">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !busy) setPhase({ kind: 'confirm', name: trimmed })
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. llama3.2"
          aria-label="Model to install"
          spellCheck={false}
          disabled={busy}
        />
        <button className="btn primary" type="submit" disabled={!valid || busy}>
          Install
        </button>
      </form>
      {trimmed && !valid && <div className="error-text">Use a name like llama3.2 or qwen2.5:7b.</div>}

      {phase.kind === 'pulling' && (
        <PullProgressView name={phase.name} progress={phase.progress} onCancel={() => handleRef.current?.cancel()} />
      )}
      {phase.kind === 'done' && (
        <div className="success-text">
          Installed {phase.name}
          {phase.size > 0 ? ` (${formatBytes(phase.size)})` : ''}.
        </div>
      )}
      {phase.kind === 'error' && <div className="error-text">{phase.message}</div>}

      {phase.kind === 'confirm' && (
        <ConfirmDialog
          title={alreadyInstalled ? `Update ${phase.name}?` : `Install ${phase.name}?`}
          confirmLabel={alreadyInstalled ? 'Update' : 'Download & install'}
          onCancel={() => setPhase({ kind: 'idle' })}
          onConfirm={() => void start(phase.name)}
        >
          <p>
            Your local Ollama will download <span className="mono">{phase.name}</span> from the Ollama library
            (ollama.com/library).
          </p>
          <p className="muted small">
            Models are large, typically 1–5 GB for small ones and 20 GB+ for big ones. The exact size is shown in the
            progress bar as soon as the download starts, and you can cancel at any time (Ollama resumes a cancelled
            download where it left off).
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function PullProgressView({
  name,
  progress,
  onCancel
}: {
  name: string
  progress: PullState
  onCancel: () => void
}): React.JSX.Element {
  const known = progress.percent !== null
  return (
    <div className="progress" aria-live="polite">
      <div className="progress-row">
        <span className="mono">{name}</span>
        <span>{known ? `${Math.floor(progress.percent ?? 0)}%` : ''}</span>
      </div>
      <div
        className={known ? 'progress-bar' : 'progress-bar indeterminate'}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.floor(progress.percent ?? 0) : undefined}
      >
        <div style={known ? { width: `${progress.percent}%` } : undefined} />
      </div>
      <div className="progress-row">
        <span>
          {progress.total > 0
            ? `${formatBytes(progress.completed)} of ${formatBytes(progress.total)}`
            : progress.status}
        </span>
        <button className="icon-btn danger small" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      {progress.total > 0 && (
        <div className="progress-row">
          <span>{progress.status}</span>
        </div>
      )}
    </div>
  )
}
