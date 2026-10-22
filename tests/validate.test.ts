import { describe, expect, it } from 'vitest'
import { validateChatOptions, validateChatRequest, validateModelName } from '../src/main/validate'

describe('validateModelName', () => {
  it('accepts normal Ollama model names', () => {
    for (const name of [
      'llama3.2',
      'qwen2.5:7b',
      'hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M',
      'user/model:latest'
    ]) {
      expect(validateModelName(name)).toBe(name)
    }
    expect(validateModelName('  llama3.2  ')).toBe('llama3.2')
  })

  it('rejects junk', () => {
    for (const bad of ['', ' ', 'rm -rf /', '../etc', 'a'.repeat(201), 42, null]) {
      expect(() => validateModelName(bad)).toThrow()
    }
  })
})

describe('validateChatOptions', () => {
  it('keeps in-range values and drops the rest', () => {
    expect(validateChatOptions({ temperature: 0.7, top_p: 0.9, num_ctx: 4096.4 })).toEqual({
      temperature: 0.7,
      top_p: 0.9,
      num_ctx: 4096
    })
    expect(validateChatOptions({ temperature: 9, top_p: -1, num_ctx: 10, extra: 1 })).toEqual({})
    expect(validateChatOptions(undefined)).toEqual({})
  })
})

describe('validateChatRequest', () => {
  it('passes a valid request through', () => {
    const req = validateChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }], options: {} })
    expect(req).toEqual({ model: 'm', messages: [{ role: 'user', content: 'hi' }], options: {} })
  })

  it('rejects bad roles and empty history', () => {
    expect(() => validateChatRequest({ model: 'm', messages: [] })).toThrow()
    expect(() => validateChatRequest({ model: 'm', messages: [{ role: 'tool', content: 'x' }] })).toThrow()
    expect(() => validateChatRequest(null)).toThrow()
  })
})
