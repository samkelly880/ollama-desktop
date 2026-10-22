import type { ModelSettings } from './settings'
import type { ChatChunk, ChatRequest, ModelInfo, OllamaErrorKind, RunningModel } from './ollama'

export interface ApiError {
  message: string
  kind: OllamaErrorKind | 'internal'
}

/** Every IPC call resolves to a Result so error details survive the process boundary. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }

export interface ModelsSnapshot {
  models: ModelInfo[]
  running: RunningModel[]
}

/** How a stream finished: `error` is null on success; kind 'aborted' means it was stopped. */
export interface StreamEnd {
  error: ApiError | null
}

export interface StreamHandle {
  /** Resolves once the stream has finished, failed or been cancelled. */
  done: Promise<StreamEnd>
  cancel(): void
}

export type StreamKind = 'chat'

/** The API exposed to the renderer as `window.api` by the preload script. */
export interface DesktopApi {
  ollama: {
    version(): Promise<Result<string>>
    models(): Promise<Result<ModelsSnapshot>>
    chat(req: ChatRequest, onChunk: (chunk: ChatChunk) => void): StreamHandle
  }
  settings: {
    get(model: string): Promise<Result<{ settings: ModelSettings; saved: boolean }>>
    set(model: string, settings: ModelSettings): Promise<Result<ModelSettings>>
    reset(model: string): Promise<Result<ModelSettings>>
  }
}
