const STORAGE_KEY = 'huaqi_feature_usage'

export type FeatureKey = 'handout' | 'book'

interface UsageStore {
  [teacherId: string]: Partial<Record<FeatureKey, number>>
}

function readStore(): UsageStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as UsageStore
  } catch {
    return {}
  }
}

function writeStore(store: UsageStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore
  }
}

export function getFeatureUsage(teacherId: string): Record<FeatureKey, number> {
  const row = readStore()[teacherId] ?? {}
  return {
    handout: row.handout ?? 0,
    book: row.book ?? 0,
  }
}

export function incrementFeatureUsage(teacherId: string, feature: FeatureKey): number {
  const store = readStore()
  const row = store[teacherId] ?? {}
  const next = (row[feature] ?? 0) + 1
  store[teacherId] = { ...row, [feature]: next }
  writeStore(store)
  return next
}
