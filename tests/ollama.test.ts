import { describe, expect, it } from 'vitest'
import { assertLocalUrl, OllamaClient, OllamaError } from '../src/shared/ollama'
import { fakeFetch, json } from './helpers'

describe('assertLocalUrl', () => {
  it('accepts local addresses', () => {
    expect(assertLocalUrl('http://127.0.0.1:11434').port).toBe('11434')
    expect(assertLocalUrl('http://localhost:11434').hostname).toBe('localhost')
    expect(assertLocalUrl('http://[::1]:11434').hostname).toBe('[::1]')
  })

  it('rejects anything that is not this machine', () => {
    expect(() => assertLocalUrl('http://192.168.1.10:11434')).toThrow(OllamaError)
    expect(() => assertLocalUrl('http://0.0.0.0:11434')).toThrow(OllamaError)
    expect(() => assertLocalUrl('https://ollama.com')).toThrow(OllamaError)
    expect(() => assertLocalUrl('not a url')).toThrow(OllamaError)
  })

  it('is enforced by the client constructor', () => {
    expect(() => new OllamaClient({ baseUrl: 'http://example.com:11434' })).toThrow(/local/)
  })
})

describe('OllamaClient basics', () => {
  it('reads the server version', async () => {
    const { fetch, calls } = fakeFetch({ 'GET /api/version': () => json({ version: '0.12.3' }) })
    const client = new OllamaClient({ fetch })
    await expect(client.version()).resolves.toBe('0.12.3')
    expect(calls[0].url).toBe('http://127.0.0.1:11434/api/version')
  })

  it('lists installed models newest first', async () => {
    const { fetch } = fakeFetch({
      'GET /api/tags': () =>
        json({
          models: [
            { name: 'old:latest', model: 'old:latest', modified_at: '2025-01-01T00:00:00Z', size: 1, digest: 'a' },
            { name: 'new:latest', model: 'new:latest', modified_at: '2026-01-01T00:00:00Z', size: 2, digest: 'b' }
          ]
        })
    })
    const models = await new OllamaClient({ fetch }).listModels()
    expect(models.map((m) => m.name)).toEqual(['new:latest', 'old:latest'])
  })

  it('treats a missing models array as empty', async () => {
    const { fetch } = fakeFetch({ 'GET /api/tags': () => json({}), 'GET /api/ps': () => json({}) })
    const client = new OllamaClient({ fetch })
    await expect(client.listModels()).resolves.toEqual([])
    await expect(client.listRunning()).resolves.toEqual([])
  })

  it('reports an unreachable server with a friendly error', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const err = await new OllamaClient({ fetch: failing }).listModels().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OllamaError)
    expect((err as OllamaError).kind).toBe('unreachable')
    expect((err as OllamaError).message).toMatch(/Is it running/)
  })

  it('surfaces the error message Ollama returns', async () => {
    const { fetch } = fakeFetch({ 'GET /api/tags': () => json({ error: 'something broke' }, 500) })
    const err = (await new OllamaClient({ fetch }).listModels().catch((e: unknown) => e)) as OllamaError
    expect(err.kind).toBe('http')
    expect(err.status).toBe(500)
    expect(err.message).toBe('something broke')
  })
})
