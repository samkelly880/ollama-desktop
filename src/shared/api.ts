import type { ModelInfo, OllamaErrorKind, RunningModel } from './ollama'

/** Every IPC call resolves to a Result so error details survive the process boundary. */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string; kind: OllamaErrorKind | 'internal' } }

export interface ModelsSnapshot {
  models: ModelInfo[]
  running: RunningModel[]
}

/** The API exposed to the renderer as `window.api` by the preload script. */
export interface DesktopApi {
  ollama: {
    version(): Promise<Result<string>>
    models(): Promise<Result<ModelsSnapshot>>
  }
}
