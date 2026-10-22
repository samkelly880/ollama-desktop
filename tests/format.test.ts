import { describe, expect, it } from 'vitest'
import { formatBytes, formatRelativeTime } from '../src/shared/format'

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(2_019_393_189)).toBe('2.0 GB')
    expect(formatBytes(274_302_450)).toBe('274 MB')
  })

  it('handles bad input', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-22T12:00:00Z')
  it('describes recent times', () => {
    expect(formatRelativeTime('2026-10-22T11:59:30Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-10-22T11:59:00Z', now)).toBe('1 minute ago')
    expect(formatRelativeTime('2026-10-22T09:00:00Z', now)).toBe('3 hours ago')
    expect(formatRelativeTime('2026-10-20T12:00:00Z', now)).toBe('2 days ago')
  })
  it('falls back to a date for old times', () => {
    expect(formatRelativeTime('2026-01-05T00:00:00Z', now)).toBe('2026-01-05')
    expect(formatRelativeTime('nope', now)).toBe('unknown')
  })
})
