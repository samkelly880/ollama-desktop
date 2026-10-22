import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, sanitizeSettings, type ModelSettings } from '../shared/settings'

interface SettingsFile {
  version: 1
  models: Record<string, ModelSettings>
}

/**
 * Stores settings per model in a small JSON file (in Electron's userData folder,
 * i.e. ~/.config/ollama-desktop/settings.json on Linux).
 */
export class SettingsStore {
  private data: SettingsFile = { version: 1, models: {} }
  private loaded: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()

  constructor(readonly filePath: string) {}

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<SettingsFile>
        const models: Record<string, ModelSettings> = {}
        for (const [name, value] of Object.entries(parsed.models ?? {})) models[name] = sanitizeSettings(value)
        this.data = { version: 1, models }
      } catch {
        // Missing or unreadable file: start with defaults (the file is rewritten on next save).
        this.data = { version: 1, models: {} }
      }
    })()
    return this.loaded
  }

  /** Settings for a model, falling back to defaults. `saved` tells whether any were stored. */
  async get(model: string): Promise<{ settings: ModelSettings; saved: boolean }> {
    await this.load()
    const stored = this.data.models[model]
    return { settings: stored ? { ...stored } : { ...DEFAULT_SETTINGS }, saved: Boolean(stored) }
  }

  async all(): Promise<Record<string, ModelSettings>> {
    await this.load()
    return structuredClone(this.data.models)
  }

  async set(model: string, settings: unknown): Promise<ModelSettings> {
    await this.load()
    const clean = sanitizeSettings(settings)
    this.data.models[model] = clean
    await this.persist()
    return { ...clean }
  }

  async reset(model: string): Promise<ModelSettings> {
    await this.load()
    delete this.data.models[model]
    await this.persist()
    return { ...DEFAULT_SETTINGS }
  }

  /** Writes are queued and atomic (temp file + rename), so a crash can't leave half a file. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2)
    this.writes = this.writes
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        const tmp = `${this.filePath}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, this.filePath)
      })
    return this.writes
  }
}
