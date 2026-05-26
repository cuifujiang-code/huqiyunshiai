import type { Profile, UserRole } from './supabase'

const PROFILE_KEY = 'huaqi_local_profiles'
const SESSION_KEY = 'huaqi_local_session'

function phoneToUserId(digits: string): string {
  const hex = BigInt(digits).toString(16).padStart(12, '0').slice(-12)
  return `00000000-0000-4000-8000-${hex}`
}

function readProfiles(): Record<string, Profile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as Record<string, Profile>
  } catch {
    return {}
  }
}

export function getLocalSession(): { userId: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as { userId: string }) : null
  } catch {
    return null
  }
}

export function getLocalProfile(userId: string): Profile | null {
  return readProfiles()[userId] ?? null
}

export function localMockSignIn(phone: string, role: UserRole): Profile {
  const digits = phone.replace(/\D/g, '').slice(-11)
  const formattedPhone = phone.startsWith('+') ? phone : `+86${digits}`
  const userId = phoneToUserId(digits)

  const profile: Profile = {
    id: userId,
    phone: formattedPhone,
    role,
    created_at: new Date().toISOString(),
  }

  const profiles = readProfiles()
  profiles[userId] = profile
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles))
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }))
  return profile
}

export function clearLocalSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function isLocalMockActive(): boolean {
  return getLocalSession() !== null
}
