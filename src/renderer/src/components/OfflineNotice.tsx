interface Props {
  message: string
  retrying: boolean
  onRetry: () => void
}

export function OfflineNotice({ message, retrying, onRetry }: Props): React.JSX.Element {
  return (
    <div className="offline">
      <div className="offline-card">
        <div className="offline-icon" aria-hidden>
          ⏻
        </div>
        <h2>Ollama isn&apos;t running</h2>
        <p className="muted">
          This app needs the Ollama server running on this computer at <code>127.0.0.1:11434</code>.
        </p>
        <p className="muted small">Details: {message}</p>
        <div className="offline-steps">
          <p>Start it with one of these, then press Retry:</p>
          <pre>ollama serve</pre>
          <pre>sudo systemctl start ollama</pre>
          <p className="muted small">
            Not installed yet? See <span className="mono">https://ollama.com/download/linux</span>
          </p>
        </div>
        <button className="btn primary" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Checking…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}
