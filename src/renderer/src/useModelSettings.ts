import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, sanitizeSettings, type ModelSettings } from '../../shared/settings'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Loads and auto-saves (debounced) the settings of the selected model. */
export function useModelSettings(model: string | null) {
  const [settings, setSettingsState] = useState<ModelSettings>({ ...DEFAULT_SETTINGS })
  const current = useRef<ModelSettings>(settings)
  const setSettings = useCallback((next: ModelSettings) => {
    current.current = next
    setSettingsState(next)
  }, [])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const pending = useRef<{ model: string; timer: ReturnType<typeof setTimeout>; value: ModelSettings } | null>(null)

  const flush = useCallback(async () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    setSaveState('saving')
    const res = await window.api.settings.set(p.model, p.value)
    setSaveState(res.ok ? 'saved' : 'error')
  }, [])

  // Don't lose a change made just before the window is closed.
  useEffect(() => {
    const onUnload = (): void => void flush()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [flush])

  // When the model changes: save anything pending for the old one, then load the new one.
  useEffect(() => {
    let cancelled = false
    void flush()
    setSaveState('idle')
    if (!model) {
      setSettings({ ...DEFAULT_SETTINGS })
      return
    }
    void window.api.settings.get(model).then((res) => {
      if (!cancelled) setSettings(res.ok ? res.value.settings : { ...DEFAULT_SETTINGS })
    })
    return () => {
      cancelled = true
    }
  }, [model, flush, setSettings])

  const update = useCallback(
    (patch: Partial<ModelSettings>) => {
      if (!model) return
      const next = sanitizeSettings({ ...current.current, ...patch })
      setSettings(next)
      if (pending.current) clearTimeout(pending.current.timer)
      pending.current = { model, value: next, timer: setTimeout(() => void flush(), 400) }
    },
    [model, flush, setSettings]
  )

  const reset = useCallback(async () => {
    if (!model) return
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
    const res = await window.api.settings.reset(model)
    setSettings(res.ok ? res.value : { ...DEFAULT_SETTINGS })
    setSaveState(res.ok ? 'saved' : 'error')
  }, [model, setSettings])

  return { settings, update, reset, saveState }
}
