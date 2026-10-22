import { ipcMain } from 'electron'
import type { Result } from '../shared/api'
import { OllamaClient, OllamaError } from '../shared/ollama'

export function toResultError(err: unknown): Extract<Result<never>, { ok: false }> {
  if (err instanceof OllamaError) return { ok: false, error: { message: err.message, kind: err.kind } }
  const message = err instanceof Error ? err.message : String(err)
  return { ok: false, error: { message, kind: 'internal' } }
}

function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      return toResultError(err)
    }
  })
}

export function registerIpc(client: OllamaClient): void {
  handle('ollama:version', () => client.version(AbortSignal.timeout(3000)))

  handle('ollama:models', async () => {
    const [models, running] = await Promise.all([
      client.listModels(AbortSignal.timeout(5000)),
      client.listRunning(AbortSignal.timeout(5000)).catch(() => [])
    ])
    return { models, running }
  })
}
