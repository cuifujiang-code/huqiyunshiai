import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  clearLocalSession,
  getLocalProfile,
  getLocalSession,
  isLocalMockActive,
} from '../lib/localMockAuth'
import { supabase, type Profile, type UserRole } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  isAuthenticated: boolean
  isLocalMock: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<Profile | null>
  ensureProfile: (phone: string, role: UserRole, userId?: string) => Promise<Profile | null>
  applyLocalMockProfile: (profile: Profile) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLocalMock, setIsLocalMock] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('Supabase profiles 不可用，使用本地资料:', error.message)
      return getLocalProfile(userId)
    }

    return data as Profile | null
  }, [])

  const applyLocalMockProfile = useCallback((localProfile: Profile) => {
    setIsLocalMock(true)
    setProfile(localProfile)
    setSession(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (isLocalMock) {
      const local = getLocalSession()
      if (!local) return null
      const data = getLocalProfile(local.userId)
      setProfile(data)
      return data
    }
    if (!session?.user) return null
    const data = await fetchProfile(session.user.id)
    setProfile(data)
    return data
  }, [fetchProfile, isLocalMock, session?.user])

  const ensureProfile = useCallback(
    async (phone: string, role: UserRole, userId?: string) => {
      const id = userId ?? session?.user?.id
      if (!id) return null

      const existing = await fetchProfile(id)
      if (existing) {
        setProfile(existing)
        return existing
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert({ id, phone, role })
        .select()
        .single()

      if (error) {
        console.warn('Supabase 写入 profiles 失败，使用本地资料:', error.message)
        const localProfile = getLocalProfile(id) ?? {
          id,
          phone,
          role,
          created_at: new Date().toISOString(),
        }
        setProfile(localProfile)
        return localProfile
      }

      setProfile(data as Profile)
      return data as Profile
    },
    [fetchProfile, session?.user],
  )

  useEffect(() => {
    const init = async () => {
      const local = getLocalSession()
      if (local && isLocalMockActive()) {
        setIsLocalMock(true)
        setProfile(getLocalProfile(local.userId))
        setLoading(false)
        return
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession)
      if (currentSession?.user) {
        const p = await fetchProfile(currentSession.user.id)
        setProfile(p)
      }
      setLoading(false)
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isLocalMockActive() && !nextSession) return
      setIsLocalMock(false)
      setSession(nextSession)
      if (nextSession?.user) {
        fetchProfile(nextSession.user.id).then(setProfile)
      } else if (!isLocalMockActive()) {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    clearLocalSession()
    setIsLocalMock(false)
    setProfile(null)
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const isAuthenticated = !!session || isLocalMock

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated,
      isLocalMock,
      loading,
      signOut,
      refreshProfile,
      ensureProfile,
      applyLocalMockProfile,
    }),
    [
      session,
      profile,
      isAuthenticated,
      isLocalMock,
      loading,
      signOut,
      refreshProfile,
      ensureProfile,
      applyLocalMockProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}
