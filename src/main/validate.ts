import type { ChatMessage, ChatOptions, ChatRequest } from '../shared/ollama'

/**
 * Validation for data arriving from the renderer over IPC.
 * The renderer is our own code, but we still never pass unchecked input on.
 */

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/:]*$/
const ROLES = new Set(['system', 'user', 'assistant'])

export function validateModelName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Model name must be text')
  const name = value.trim()
  if (!name || name.length > 200 || !MODEL_NAME.test(name)) {
    throw new Error(`"${name.slice(0, 60)}" is not a valid model name (e.g. llama3.2 or qwen2.5:7b)`)
  }
  return name
}

function finiteInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined
}

export function validateChatOptions(value: unknown): ChatOptions {
  const input = (value ?? {}) as Record<string, unknown>
  const options: ChatOptions = {}
  const temperature = finiteInRange(input.temperature, 0, 2)
  const topP = finiteInRange(input.top_p, 0, 1)
  const numCtx = finiteInRange(input.num_ctx, 256, 1_048_576)
  if (temperature !== undefined) options.temperature = temperature
  if (topP !== undefined) options.top_p = topP
  if (numCtx !== undefined) options.num_ctx = Math.round(numCtx)
  return options
}

export function validateChatRequest(value: unknown): ChatRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid chat request')
  const input = value as Record<string, unknown>
  const model = validateModelName(input.model)
  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 2000) {
    throw new Error('Invalid chat history')
  }
  const messages: ChatMessage[] = input.messages.map((m: unknown) => {
    const msg = (m ?? {}) as Record<string, unknown>
    if (typeof msg.role !== 'string' || !ROLES.has(msg.role) || typeof msg.content !== 'string') {
      throw new Error('Invalid chat message')
    }
    return { role: msg.role as ChatMessage['role'], content: msg.content }
  })
  return { model, messages, options: validateChatOptions(input.options) }
}
