/** Builds a fake `fetch` that answers from a route table, recording each call. */
export interface FakeCall {
  url: string
  init?: RequestInit
}

export type Route = (init?: RequestInit) => Response | Promise<Response>

export function fakeFetch(routes: Record<string, Route>): { fetch: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = []
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    const path = new URL(url).pathname
    const route = routes[`${init?.method ?? 'GET'} ${path}`]
    if (!route) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    return route(init)
  }
  return { fetch: impl as typeof fetch, calls }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A streaming NDJSON response whose body arrives in the given raw chunks. */
export function ndjsonStream(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    }
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
}
