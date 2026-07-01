import { useCallback, useEffect, useState } from 'react'

import { fetchUserProfile } from './api'
import type { UserProfile } from '../types'

export const USER_PROFILE_CHANGED_EVENT = 'paper-reader:user-profile-changed'

const FALLBACK_PROFILE: UserProfile = {
  username: 'user',
  display_name: '',
  badge_text: '',
}

export function notifyUserProfileChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(USER_PROFILE_CHANGED_EVENT))
}

export type UseUserProfileResult = {
  profile: UserProfile
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

export function useUserProfile(enabled: boolean): UseUserProfileResult {
  const [profile, setProfile] = useState<UserProfile>(FALLBACK_PROFILE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchUserProfile()
      setProfile(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载个人资料失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()

    function handleChanged() {
      void refresh()
    }

    window.addEventListener(USER_PROFILE_CHANGED_EVENT, handleChanged)
    return () => {
      window.removeEventListener(USER_PROFILE_CHANGED_EVENT, handleChanged)
    }
  }, [enabled, refresh])

  return { profile, loading, error, refresh }
}

export function resolveSidebarName(profile: UserProfile): string {
  return profile.display_name.trim() || profile.username
}

export function resolveSidebarBadge(profile: UserProfile): string {
  return profile.badge_text.trim()
}
