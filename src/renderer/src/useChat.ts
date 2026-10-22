import { useCallback, useRef, useState } from 'react'
import type { StreamHandle } from '../../shared/api'
import type { ChatMessage, ChatOptions } from '../../shared/ollama'

export interface UiMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  model?: string
  status: 'streaming' | 'done' | 'stopped' | 'error'
  error?: string
}

export interface SendOptions {
  system?: string
  options?: ChatOptions
}

let nextId = 1

/** Chat state: the conversation, the in-flight streaming reply, stop and clear. */
export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const handleRef = useRef<StreamHandle | null>(null)

  const update = (id: number, fn: (m: UiMessage) => UiMessage): void =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)))

  const send = useCallback(
    async (text: string, model: string, extra: SendOptions = {}) => {
      const content = text.trim()
      if (!content || handleRef.current) return

      // History sent to the model: everything that didn't fail, plus the new message.
      const history: ChatMessage[] = messages
        .filter((m) => m.status !== 'error' && m.content)
        .map((m) => ({ role: m.role, content: m.content }))
      const system: ChatMessage[] = extra.system?.trim() ? [{ role: 'system', content: extra.system.trim() }] : []

      const userMsg: UiMessage = { id: nextId++, role: 'user', content, status: 'done' }
      const reply: UiMessage = { id: nextId++, role: 'assistant', content: '', model, status: 'streaming' }
      setMessages((prev) => [...prev, userMsg, reply])
      setStreaming(true)

      const handle = window.api.ollama.chat(
        { model, messages: [...system, ...history, { role: 'user', content }], options: extra.options },
        (chunk) => {
          const delta = chunk.message?.content
          if (delta) update(reply.id, (m) => ({ ...m, content: m.content + delta }))
        }
      )
      handleRef.current = handle
      const end = await handle.done
      handleRef.current = null
      setStreaming(false)
      update(reply.id, (m) =>
        !end.error
          ? { ...m, status: 'done' }
          : end.error.kind === 'aborted'
            ? { ...m, status: 'stopped' }
            : { ...m, status: 'error', error: end.error.message }
      )
    },
    [messages]
  )

  const stop = useCallback(() => handleRef.current?.cancel(), [])

  const clear = useCallback(() => {
    handleRef.current?.cancel()
    setMessages([])
  }, [])

  return { messages, streaming, send, stop, clear }
}
