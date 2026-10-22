import { ipcMain } from 'electron'
import type { ApiError, Result, StreamEnd, StreamKind } from '../shared/api'
import { OllamaClient, OllamaError } from '../shared/ollama'
import type { SettingsStore } from './settingsStore'
import { validateChatRequest, validateModelName } from './validate'

export function toApiError(err: unknown): ApiError {
  if (err instanceof OllamaError) return { message: err.message, kind: err.kind }
  return { message: err instanceof Error ? err.message : String(err), kind: 'internal' }
}

function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      return { ok: false, error: toApiError(err) }
    }
  })
}

function openStream(client: OllamaClient, kind: StreamKind, payload: unknown, signal: AbortSignal): AsyncIterable<unknown> {
  switch (kind) {
    case 'chat':
      return client.chat(validateChatRequest(payload), signal)
    default:
      throw new Error(`Unknown stream kind: ${String(kind)}`)
  }
}

export function registerIpc(client: OllamaClient, settings: SettingsStore): void {
  handle('ollama:version', () => client.version(AbortSignal.timeout(3000)))

  handle('ollama:models', async () => {
    const [models, running] = await Promise.all([
      client.listModels(AbortSignal.timeout(5000)),
      client.listRunning(AbortSignal.timeout(5000)).catch(() => [])
    ])
    return { models, running }
  })

  handle('settings:get', (model: unknown) => settings.get(validateModelName(model)))
  handle('settings:set', (model: unknown, value: unknown) => settings.set(validateModelName(model), value))
  handle('settings:reset', (model: unknown) => settings.reset(validateModelName(model)))

  // Streaming requests (chat replies, model downloads). Each stream has an id chosen by
  // the renderer; data arrives as 'stream:data' events and finishes with one 'stream:end'.
  const active = new Map<string, AbortController>()

  ipcMain.handle('stream:start', (event, id: unknown, kind: StreamKind, payload: unknown): Result<null> => {
    if (typeof id !== 'string' || !id || active.has(id)) {
      return { ok: false, error: { message: 'Invalid stream id', kind: 'internal' } }
    }
    const controller = new AbortController()
    let iterable: AsyncIterable<unknown>
    try {
      iterable = openStream(client, kind, payload, controller.signal)
    } catch (err) {
      return { ok: false, error: toApiError(err) }
    }
    active.set(id, controller)
    const sender = event.sender

    void (async () => {
      let end: StreamEnd = { error: null }
      try {
        for await (const item of iterable) {
          if (sender.isDestroyed()) {
            controller.abort()
            break
          }
          sender.send('stream:data', id, item)
        }
      } catch (err) {
        end = { error: controller.signal.aborted ? { message: 'Stopped', kind: 'aborted' } : toApiError(err) }
      } finally {
        active.delete(id)
        if (!sender.isDestroyed()) sender.send('stream:end', id, end)
      }
    })()
    return { ok: true, value: null }
  })

  ipcMain.handle('stream:cancel', (_event, id: unknown) => {
    if (typeof id === 'string') active.get(id)?.abort()
  })
}
