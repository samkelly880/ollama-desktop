import { describe, expect, it } from 'vitest'
import { OllamaClient, OllamaError, readNdjson, type ChatChunk } from '../src/shared/ollama'
import { fakeFetch, json, ndjsonStream } from './helpers'

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iter) out.push(item)
  return out
}

function body(chunks: string[]): ReadableStream<Uint8Array> {
  return ndjsonStream(chunks).body as ReadableStream<Uint8Array>
}

describe('readNdjson', () => {
  it('parses one object per line', async () => {
    await expect(collect(readNdjson(body(['{"a":1}\n{"a":2}\n'])))).resolves.toEqual([{ a: 1 }, { a: 2 }])
  })

  it('joins objects split across network chunks', async () => {
    const items = await collect(readNdjson(body(['{"msg":"he', 'llo"}\n{"ms', 'g":"world"}\n'])))
    expect(items).toEqual([{ msg: 'hello' }, { msg: 'world' }])
  })

  it('handles a final line without a newline and skips blank lines', async () => {
    await expect(collect(readNdjson(body(['\n{"a":1}\n\n', '{"a":2}'])))).resolves.toEqual([{ a: 1 }, { a: 2 }])
  })

  it('keeps multi-byte characters intact across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode('{"t":"héllo 👋"}\n')
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]))
        c.close()
      }
    })
    await expect(collect(readNdjson(stream))).resolves.toEqual([{ t: 'héllo 👋' }])
  })

  it('throws error lines sent mid-stream', async () => {
    const iter = readNdjson(body(['{"a":1}\n{"error":"model crashed"}\n']))
    await expect(collect(iter)).rejects.toThrow('model crashed')
  })

  it('throws a readable error on malformed JSON', async () => {
    await expect(collect(readNdjson(body(['not json\n'])))).rejects.toBeInstanceOf(OllamaError)
  })
})

describe('OllamaClient.chat', () => {
  it('posts a streaming request and yields chunks as they arrive', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /api/chat': () =>
        ndjsonStream([
          '{"model":"m","message":{"role":"assistant","content":"Hel"},"done":false}\n',
          '{"model":"m","message":{"role":"assistant","content":"lo"},"done":false}\n',
          '{"model":"m","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}\n'
        ])
    })
    const client = new OllamaClient({ fetch })
    const chunks: ChatChunk[] = await collect(
      client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], options: { temperature: 0.2 } })
    )
    expect(chunks.map((c) => c.message?.content).join('')).toBe('Hello')
    expect(chunks.at(-1)?.done).toBe(true)

    const sent = JSON.parse(String(calls[0].init?.body))
    expect(sent).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      options: { temperature: 0.2 },
      stream: true
    })
  })

  it('reports "model not found" from Ollama', async () => {
    const { fetch } = fakeFetch({ 'POST /api/chat': () => json({ error: 'model "x" not found' }, 404) })
    const iter = new OllamaClient({ fetch }).chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] })
    await expect(collect(iter)).rejects.toThrow('model "x" not found')
  })

  it('maps an aborted request to kind "aborted"', async () => {
    const controller = new AbortController()
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return json({})
    }) as unknown as typeof fetch
    controller.abort()
    const iter = new OllamaClient({ fetch: fetchImpl }).chat(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      controller.signal
    )
    const err = (await collect(iter).catch((e: unknown) => e)) as OllamaError
    expect(err.kind).toBe('aborted')
  })
})
