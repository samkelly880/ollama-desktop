import type { ChatOptions } from './ollama'

/** Per-model generation settings, remembered between sessions. */
export interface ModelSettings {
  /** 0–2. Higher = more creative, lower = more focused. */
  temperature: number
  /** 0–1. Nucleus sampling cut-off. */
  topP: number
  /** Context window in tokens; null = use the model's default. */
  numCtx: number | null
  /** Sent as a system message at the start of every chat. Empty = none. */
  systemPrompt: string
}

/** Same defaults Ollama itself uses, so "untouched" behaves like the CLI. */
export const DEFAULT_SETTINGS: Readonly<ModelSettings> = Object.freeze({
  temperature: 0.8,
  topP: 0.9,
  numCtx: null,
  systemPrompt: ''
})

export const LIMITS = {
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  numCtx: { min: 256, max: 1_048_576 },
  systemPromptMaxLength: 20_000
} as const

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Turns anything (old files, hand-edited JSON, UI input) into valid settings. */
export function sanitizeSettings(input: unknown): ModelSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const numCtx =
    raw.numCtx === null || raw.numCtx === undefined || raw.numCtx === ''
      ? null
      : Math.round(clamp(raw.numCtx, LIMITS.numCtx.min, LIMITS.numCtx.max, Number.NaN))
  return {
    temperature: round2(clamp(raw.temperature, LIMITS.temperature.min, LIMITS.temperature.max, DEFAULT_SETTINGS.temperature)),
    topP: round2(clamp(raw.topP, LIMITS.topP.min, LIMITS.topP.max, DEFAULT_SETTINGS.topP)),
    numCtx: Number.isFinite(numCtx) ? numCtx : null,
    systemPrompt:
      typeof raw.systemPrompt === 'string' ? raw.systemPrompt.slice(0, LIMITS.systemPromptMaxLength) : ''
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function isDefaultSettings(s: ModelSettings): boolean {
  return (
    s.temperature === DEFAULT_SETTINGS.temperature &&
    s.topP === DEFAULT_SETTINGS.topP &&
    s.numCtx === DEFAULT_SETTINGS.numCtx &&
    s.systemPrompt === DEFAULT_SETTINGS.systemPrompt
  )
}

/** Maps settings to the `options` object of an Ollama /api/chat request. */
export function toChatOptions(s: ModelSettings): ChatOptions {
  const options: ChatOptions = { temperature: s.temperature, top_p: s.topP }
  if (s.numCtx !== null) options.num_ctx = s.numCtx
  return options
}
