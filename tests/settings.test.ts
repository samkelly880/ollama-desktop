import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from '../src/main/settingsStore'
import { DEFAULT_SETTINGS, isDefaultSettings, sanitizeSettings, toChatOptions } from '../src/shared/settings'

describe('sanitizeSettings', () => {
  it('fills in defaults for missing or broken values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ temperature: 'hot', topP: null, numCtx: 'big', systemPrompt: 5 })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps out-of-range numbers', () => {
    const s = sanitizeSettings({ temperature: 5, topP: -2, numCtx: 10 })
    expect(s.temperature).toBe(2)
    expect(s.topP).toBe(0)
    expect(s.numCtx).toBe(256)
  })

  it('rounds slider noise and context length', () => {
    const s = sanitizeSettings({ temperature: 0.30000000000000004, topP: 0.95, numCtx: 8191.6 })
    expect(s).toMatchObject({ temperature: 0.3, topP: 0.95, numCtx: 8192 })
  })
})

describe('toChatOptions', () => {
  it('maps settings to Ollama option names', () => {
    expect(toChatOptions({ ...DEFAULT_SETTINGS, temperature: 0.2, numCtx: 4096 })).toEqual({
      temperature: 0.2,
      top_p: 0.9,
      num_ctx: 4096
    })
  })
  it('leaves num_ctx out when using the model default', () => {
    expect(toChatOptions(DEFAULT_SETTINGS)).not.toHaveProperty('num_ctx')
  })
})

describe('SettingsStore', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ollama-desktop-test-'))
    file = join(dir, 'nested', 'settings.json')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns defaults for a model with nothing saved', async () => {
    const { settings, saved } = await new SettingsStore(file).get('llama3.2:latest')
    expect(saved).toBe(false)
    expect(isDefaultSettings(settings)).toBe(true)
  })

  it('remembers settings per model across restarts', async () => {
    const store = new SettingsStore(file)
    await store.set('llama3.2:latest', { ...DEFAULT_SETTINGS, temperature: 0.2, systemPrompt: 'Be brief.' })
    await store.set('qwen2.5:7b', { ...DEFAULT_SETTINGS, temperature: 1.3, numCtx: 8192 })

    const reopened = new SettingsStore(file)
    expect((await reopened.get('llama3.2:latest')).settings).toEqual({
      ...DEFAULT_SETTINGS,
      temperature: 0.2,
      systemPrompt: 'Be brief.'
    })
    expect((await reopened.get('qwen2.5:7b')).settings).toMatchObject({ temperature: 1.3, numCtx: 8192 })
    expect((await reopened.get('qwen2.5:7b')).saved).toBe(true)
  })

  it('sanitizes what it saves', async () => {
    const store = new SettingsStore(file)
    const saved = await store.set('m', { temperature: 99 })
    expect(saved.temperature).toBe(2)
  })

  it('reset forgets a model', async () => {
    const store = new SettingsStore(file)
    await store.set('m', { ...DEFAULT_SETTINGS, temperature: 0.1 })
    await store.reset('m')
    const json = JSON.parse(await readFile(file, 'utf8'))
    expect(json.models).toEqual({})
    expect((await new SettingsStore(file).get('m')).saved).toBe(false)
  })

  it('survives a corrupt settings file', async () => {
    const store = new SettingsStore(join(dir, 'bad.json'))
    await writeFile(join(dir, 'bad.json'), '{ not json')
    expect((await store.get('m')).settings).toEqual(DEFAULT_SETTINGS)
    await store.set('m', { ...DEFAULT_SETTINGS, topP: 0.5 })
    expect(JSON.parse(await readFile(join(dir, 'bad.json'), 'utf8')).models.m.topP).toBe(0.5)
  })

  it('keeps the last write when saves overlap', async () => {
    const store = new SettingsStore(file)
    await Promise.all([0.1, 0.2, 0.3, 0.4].map((t) => store.set('m', { ...DEFAULT_SETTINGS, temperature: t })))
    expect((await new SettingsStore(file).get('m')).settings.temperature).toBe(0.4)
  })
})
