import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/api'

const api: DesktopApi = {
  ollama: {
    version: () => ipcRenderer.invoke('ollama:version'),
    models: () => ipcRenderer.invoke('ollama:models')
  }
}

contextBridge.exposeInMainWorld('api', api)
