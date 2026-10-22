import { describe, expect, it } from 'vitest'
import { INITIAL_PULL_STATE, OllamaClient, reducePull, type PullProgress, type PullState } from '../src/shared/ollama'
import { fakeFetch, json, ndjsonStream } from './helpers'

const fold = (events: PullProgress[]): PullState => events.reduce(reducePull, INITIAL_PULL_STATE)

describe('reducePull', () => {
  it('has no percentage until a size is known', () => {
    const s = fold([{ status: 'pulling manifest' }])
    expect(s.percent).toBeNull()
    expect(s.status).toBe('pulling manifest')
  })

  it('adds up layers into one overall progress', () => {
    const s = fold([
      { status: 'pulling manifest' },
      { status: 'pulling aaa', digest: 'sha256:aaa', total: 1000, completed: 500 },
      { status: 'pulling bbb', digest: 'sha256:bbb', total: 1000, completed: 0 },
      { status: 'pulling bbb', digest: 'sha256:bbb', total: 1000, completed: 250 }
    ])
    expect(s.total).toBe(2000)
    expect(s.completed).toBe(750)
    expect(s.percent).toBeCloseTo(37.5)
  })

  it('never goes backwards or past 100%', () => {
    const s = fold([
      { status: 'pulling aaa', digest: 'sha256:aaa', total: 100, completed: 80 },
      { status: 'pulling aaa', digest: 'sha256:aaa', total: 100, completed: 20 },
      { status: 'pulling aaa', digest: 'sha256:aaa', total: 100, completed: 500 }
    ])
    expect(s.completed).toBe(100)
    expect(s.percent).toBe(100)
  })

  it('is done on "success"', () => {
    const s = fold([
      { status: 'pulling aaa', digest: 'sha256:aaa', total: 100, completed: 100 },
      { status: 'verifying sha256 digest' },
      { status: 'writing manifest' },
      { status: 'success' }
    ])
    expect(s.done).toBe(true)
    expect(s.percent).toBe(100)
    expect(s.total).toBe(100)
  })
})

describe('OllamaClient.pull / deleteModel', () => {
  it('streams pull progress', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /api/pull': () =>
        ndjsonStream([
          '{"status":"pulling manifest"}\n{"status":"pulling a","digest":"sha256:a","total":10,"completed":5}\n',
          '{"status":"success"}\n'
        ])
    })
    const events: PullProgress[] = []
    for await (const e of new OllamaClient({ fetch }).pull('llama3.2')) events.push(e)
    expect(events.map((e) => e.status)).toEqual(['pulling manifest', 'pulling a', 'success'])
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ model: 'llama3.2', stream: true })
  })

  it('throws the error Ollama streams for an unknown model', async () => {
    const { fetch } = fakeFetch({
      'POST /api/pull': () =>
        ndjsonStream(['{"status":"pulling manifest"}\n{"error":"pull model manifest: file does not exist"}\n'])
    })
    const run = async (): Promise<void> => {
      for await (const _ of new OllamaClient({ fetch }).pull('nope')) void _
    }
    await expect(run()).rejects.toThrow('file does not exist')
  })

  it('deletes a model with DELETE /api/delete', async () => {
    const { fetch, calls } = fakeFetch({ 'DELETE /api/delete': () => new Response(null, { status: 200 }) })
    await new OllamaClient({ fetch }).deleteModel('llama3.2:latest')
    expect(calls[0].init?.method).toBe('DELETE')
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ model: 'llama3.2:latest' })
  })

  it('reports a failed delete', async () => {
    const { fetch } = fakeFetch({ 'DELETE /api/delete': () => json({ error: 'model not found' }, 404) })
    await expect(new OllamaClient({ fetch }).deleteModel('x')).rejects.toThrow('model not found')
  })
})
