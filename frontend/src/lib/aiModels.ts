import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchAiProviderSettings } from './api'
import type { AiProviderSettings } from '../types'

export const SYSTEM_DEFAULT_MODEL_VALUE = ''
export const AI_PROVIDER_SETTINGS_CHANGED_EVENT = 'paper-reader:ai-provider-settings-changed'

export type AiModelOption = {
  value: string
  label: string
}

const SYSTEM_DEFAULT_MODEL_OPTION: AiModelOption = {
  value: SYSTEM_DEFAULT_MODEL_VALUE,
  label: '系统默认',
}

let cachedAiProviderSettings: AiProviderSettings | null = null
let pendingAiProviderSettingsRequest: Promise<AiProviderSettings> | null = null

function normalizeModels(settings: AiProviderSettings | null): string[] {
  const models = [
    settings?.default_model,
    ...(settings?.available_models ?? []),
  ]
  const seen = new Set<string>()
  return models
    .map((model) => model?.trim() ?? '')
    .filter((model) => {
      if (!model || seen.has(model)) return false
      seen.add(model)
      return true
    })
}

export function buildAiModelOptions(settings: AiProviderSettings | null): AiModelOption[] {
  return [
    SYSTEM_DEFAULT_MODEL_OPTION,
    ...normalizeModels(settings).map((model) => ({ value: model, label: model })),
  ]
}

async function loadAiProviderSettings(force = false): Promise<AiProviderSettings> {
  if (!force && cachedAiProviderSettings) {
    return cachedAiProviderSettings
  }
  if (!force && pendingAiProviderSettingsRequest) {
    return pendingAiProviderSettingsRequest
  }

  pendingAiProviderSettingsRequest = fetchAiProviderSettings()
    .then((settings) => {
      cachedAiProviderSettings = settings
      return settings
    })
    .finally(() => {
      pendingAiProviderSettingsRequest = null
    })

  return pendingAiProviderSettingsRequest
}

export function notifyAiProviderSettingsChanged(settings: AiProviderSettings): void {
  cachedAiProviderSettings = settings
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AiProviderSettings>(AI_PROVIDER_SETTINGS_CHANGED_EVENT, {
    detail: settings,
  }))
}

export function resetAiProviderSettingsCacheForTests(): void {
  cachedAiProviderSettings = null
  pendingAiProviderSettingsRequest = null
}

export function getAiModelLabel(value: string, options: AiModelOption[] = buildAiModelOptions(cachedAiProviderSettings)): string {
  if (!value) return SYSTEM_DEFAULT_MODEL_OPTION.label
  return options.find((model) => model.value === value)?.label || value
}

export function useAiModelOptions(
  selectedModel?: string,
  onModelUnavailable?: (model: string) => void,
) {
  const [settings, setSettings] = useState<AiProviderSettings | null>(cachedAiProviderSettings)
  const [isLoading, setIsLoading] = useState(!cachedAiProviderSettings)
  const [error, setError] = useState('')

  const refresh = useCallback(async (force = false) => {
    setIsLoading(true)
    setError('')
    try {
      const next = await loadAiProviderSettings(force)
      setSettings(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载模型列表失败')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadAiProviderSettings()
      .then((next) => {
        if (!cancelled) setSettings(next)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载模型列表失败')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    function handleSettingsChanged(event: Event) {
      const next = (event as CustomEvent<AiProviderSettings>).detail
      if (next) {
        cachedAiProviderSettings = next
        setSettings(next)
        setError('')
      } else {
        void refresh(true)
      }
    }

    window.addEventListener(AI_PROVIDER_SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    return () => {
      cancelled = true
      window.removeEventListener(AI_PROVIDER_SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    }
  }, [refresh])

  const modelOptions = useMemo(() => buildAiModelOptions(settings), [settings])
  const isModelAvailable = useCallback((model: string) => {
    if (!model) return true
    return modelOptions.some((option) => option.value === model)
  }, [modelOptions])

  useEffect(() => {
    if (!settings || !selectedModel || isModelAvailable(selectedModel)) return
    onModelUnavailable?.(SYSTEM_DEFAULT_MODEL_VALUE)
  }, [isModelAvailable, onModelUnavailable, selectedModel, settings])

  return {
    settings,
    modelOptions,
    isLoading,
    error,
    refresh,
    isModelAvailable,
  }
}
