/**
 * A small, dependency-free client for the Ollama HTTP API.
 *
 * It only ever talks to a server on this machine (127.0.0.1 / localhost / ::1).
 * `fetch` is injectable so the client can be tested without a real server.
 */

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'

export interface ModelDetails {
  format?: string
  family?: string
  parameter_size?: string
  quantization_level?: string
}

export interface ModelInfo {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details?: ModelDetails
}

export interface RunningModel {
  name: string
  model: string
  size: number
  size_vram?: number
  expires_at?: string
}

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** Model options passed through to Ollama (subset we expose in the UI). */
export interface ChatOptions {
  temperature?: number
  top_p?: number
  num_ctx?: number
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  options?: ChatOptions
}

/** One line of the streaming /api/chat response. */
export interface ChatChunk {
  model: string
  created_at?: string
  message?: { role: ChatRole; content: string }
  done: boolean
  done_reason?: string
  total_duration?: number
  eval_count?: number
  eval_duration?: number
}

/** One line of the streaming /api/pull response. */
export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

/** Overall download state, combined from the per-layer progress lines. */
export interface PullState {
  status: string
  layers: Record<string, { total: number; completed: number }>
  /** Sum over all layers seen so far (bytes). */
  total: number
  completed: number
  /** 0–100, or null while the size is still unknown. */
  percent: number | null
  done: boolean
}

export const INITIAL_PULL_STATE: PullState = Object.freeze({
  status: 'starting',
  layers: {},
  total: 0,
  completed: 0,
  percent: null,
  done: false
}) as PullState

/** Pure reducer: folds one progress line into the overall state. */
export function reducePull(state: PullState, event: PullProgress): PullState {
  let layers = state.layers
  if (event.digest && typeof event.total === 'number') {
    const previous = layers[event.digest]
    layers = {
      ...layers,
      [event.digest]: {
        total: event.total,
        // Never go backwards, even if lines arrive out of order.
        completed: Math.max(previous?.completed ?? 0, Math.min(event.total, event.completed ?? 0))
      }
    }
  }
  let total = 0
  let completed = 0
  for (const layer of Object.values(layers)) {
    total += layer.total
    completed += layer.completed
  }
  const done = event.status === 'success'
  return {
    status: event.status,
    layers,
    total,
    completed,
    percent: done ? 100 : total > 0 ? Math.min(100, (completed / total) * 100) : null,
    done
  }
}

export type OllamaErrorKind = 'unreachable' | 'http' | 'aborted' | 'invalid'

export class OllamaError extends Error {
  readonly kind: OllamaErrorKind
  readonly status?: number

  constructor(message: string, kind: OllamaErrorKind, status?: number) {
    super(message)
    this.name = 'OllamaError'
    this.kind = kind
    this.status = status
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** Throws unless the URL points at this machine. */
export function assertLocalUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new OllamaError(`Invalid Ollama URL: ${url}`, 'invalid')
  }
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new OllamaError('Only a local Ollama server (127.0.0.1) is allowed', 'invalid')
  }
  return parsed
}

function parseLine<T>(line: string): T {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new OllamaError('Ollama sent a response this app could not read', 'invalid')
  }
  const maybeError = (value as { error?: unknown } | null)?.error
  if (typeof maybeError === 'string' && maybeError) throw new OllamaError(maybeError, 'http')
  return value as T
}

/**
 * Parses a newline-delimited JSON stream (what Ollama sends when stream: true).
 * Handles objects split across network chunks and several objects in one chunk.
 * A line carrying `{"error": "..."}` is thrown as an OllamaError.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (err) {
        if (isAbortError(err)) throw new OllamaError('Request was cancelled', 'aborted')
        throw new OllamaError('Lost connection to Ollama', 'unreachable')
      }
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) yield parseLine<T>(line)
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) yield parseLine<T>(buffer.trim())
  } finally {
    // Also runs when the consumer stops early: cancel so the HTTP request is closed.
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export interface OllamaClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}

export class OllamaClient {
  readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = assertLocalUrl(options.baseUrl ?? DEFAULT_OLLAMA_URL).origin
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  /** Low-level request helper: maps network/HTTP failures to OllamaError. */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
      })
    } catch (err) {
      if (isAbortError(err)) throw new OllamaError('Request was cancelled', 'aborted')
      throw new OllamaError(`Can't reach Ollama at ${this.baseUrl}. Is it running?`, 'unreachable')
    }
    if (!res.ok) {
      let message = `Ollama returned HTTP ${res.status}`
      try {
        const body = (await res.json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error) message = body.error
      } catch {
        // body was not JSON; keep the generic message
      }
      throw new OllamaError(message, 'http', res.status)
    }
    return res
  }

  private async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await this.request(path, { method: 'GET', signal })
    return (await res.json()) as T
  }

  async version(signal?: AbortSignal): Promise<string> {
    const body = await this.getJson<{ version?: string }>('/api/version', signal)
    return body.version ?? 'unknown'
  }

  /** Installed models, newest first. */
  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const body = await this.getJson<{ models?: ModelInfo[] }>('/api/tags', signal)
    const models = body.models ?? []
    return [...models].sort((a, b) => Date.parse(b.modified_at) - Date.parse(a.modified_at))
  }

  /** Models currently loaded into memory. */
  async listRunning(signal?: AbortSignal): Promise<RunningModel[]> {
    const body = await this.getJson<{ models?: RunningModel[] }>('/api/ps', signal)
    return body.models ?? []
  }

  /** Streams a chat reply chunk by chunk. Abort `signal` to stop generation. */
  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
    const res = await this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ...req, stream: true }),
      signal
    })
    if (!res.body) throw new OllamaError('Ollama sent an empty response', 'invalid')
    yield* readNdjson<ChatChunk>(res.body)
  }

  /** Downloads (or updates) a model, streaming progress lines. Abort `signal` to cancel. */
  async *pull(model: string, signal?: AbortSignal): AsyncGenerator<PullProgress> {
    const res = await this.request('/api/pull', {
      method: 'POST',
      // `name` is the older spelling of `model`; sending both works with old and new servers.
      body: JSON.stringify({ model, name: model, stream: true }),
      signal
    })
    if (!res.body) throw new OllamaError('Ollama sent an empty response', 'invalid')
    yield* readNdjson<PullProgress>(res.body)
  }

  /** Removes an installed model and its data from disk. */
  async deleteModel(model: string, signal?: AbortSignal): Promise<void> {
    await this.request('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ model, name: model }),
      signal
    })
  }
}
