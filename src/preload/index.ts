import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, Result, StreamEnd, StreamHandle, StreamKind } from '../shared/api'

interface Listener {
  onData: (data: unknown) => void
  onEnd: (end: StreamEnd) => void
}

const listeners = new Map<string, Listener>()
let counter = 0

ipcRenderer.on('stream:data', (_event, id: string, data: unknown) => listeners.get(id)?.onData(data))
ipcRenderer.on('stream:end', (_event, id: string, end: StreamEnd) => {
  const listener = listeners.get(id)
  listeners.delete(id)
  listener?.onEnd(end)
})

function startStream<T>(kind: StreamKind, payload: unknown, onData: (data: T) => void): StreamHandle {
  const id = `${kind}-${Date.now()}-${++counter}`
  const done = new Promise<StreamEnd>((resolve) => {
    listeners.set(id, { onData: (d) => onData(d as T), onEnd: resolve })
    ipcRenderer.invoke('stream:start', id, kind, payload).then(
      (res: Result<null>) => {
        if (!res.ok) {
          listeners.delete(id)
          resolve({ error: res.error })
        }
      },
      (err: unknown) => {
        listeners.delete(id)
        resolve({ error: { message: String(err), kind: 'internal' } })
      }
    )
  })
  return { done, cancel: () => void ipcRenderer.invoke('stream:cancel', id) }
}

const api: DesktopApi = {
  ollama: {
    version: () => ipcRenderer.invoke('ollama:version'),
    models: () => ipcRenderer.invoke('ollama:models'),
    chat: (req, onChunk) => startStream('chat', req, onChunk),
    pull: (model, onProgress) => startStream('pull', model, onProgress),
    delete: (model) => ipcRenderer.invoke('ollama:delete', model)
  },
  settings: {
    get: (model) => ipcRenderer.invoke('settings:get', model),
    set: (model, settings) => ipcRenderer.invoke('settings:set', model, settings),
    reset: (model) => ipcRenderer.invoke('settings:reset', model)
  }
}

contextBridge.exposeInMainWorld('api', api)
