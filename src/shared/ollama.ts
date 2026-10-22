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
}
