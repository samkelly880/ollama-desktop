import { useEffect, useRef, useState } from 'react'
import type { ModelInfo } from '../../../shared/ollama'
import type { UiMessage } from '../useChat'

interface Props {
  models: ModelInfo[]
  model: string | null
  onModelChange: (name: string) => void
  messages: UiMessage[]
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onClear: () => void
  toolbarExtra?: React.ReactNode
}

export function ChatView(props: Props): React.JSX.Element {
  const { models, model, onModelChange, messages, streaming, onSend, onStop, onClear, toolbarExtra } = props
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Follow the reply as it streams in, unless the user scrolled up to read.
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = (): void => {
    if (!draft.trim() || !model || streaming) return
    onSend(draft)
    setDraft('')
    stickToBottom.current = true
  }

  return (
    <section className="chat">
      <div className="chat-toolbar">
        <select
          value={model ?? ''}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={models.length === 0}
          aria-label="Model"
        >
          {models.length === 0 && <option value="">No models installed</option>}
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="spacer" />
        {toolbarExtra}
        <button className="btn ghost" onClick={onClear} disabled={messages.length === 0}>
          Clear chat
        </button>
      </div>

      <div
        className="messages"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-empty">
            <h2>{model ? `Chat with ${model}` : 'No model selected'}</h2>
            <p>{model ? 'Everything stays on this computer.' : 'Install a model from the sidebar to start chatting.'}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`message ${m.role}`}>
              <div className="role">{m.role === 'user' ? 'You' : 'AI'}</div>
              <div className="content">
                {m.content}
                {m.status === 'streaming' && <span className="cursor" />}
                {m.status === 'stopped' && <span className="note">Stopped.</span>}
                {m.status === 'error' && <span className="note error">Error: {m.error}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="composer">
        <div className="composer-inner">
          <textarea
            value={draft}
            placeholder={model ? `Message ${model}… (Enter to send, Shift+Enter for a new line)` : 'Select a model first'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            disabled={!model}
            rows={1}
          />
          {streaming ? (
            <button className="btn danger" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button className="btn primary" onClick={submit} disabled={!model || !draft.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
