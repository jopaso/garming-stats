import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActivitySummary, ActivityDetail, GlobalStats, UserSettings, SyncStatus } from '../types/garmin'
import { DEFAULT_SETTINGS } from '../types/garmin'

interface ActivityState {
  activities: ActivitySummary[]
  stats: GlobalStats | null
  syncStatus: SyncStatus | null
  settings: UserSettings
  loading: boolean
  error: string | null
  detailCache: Record<number, ActivityDetail>

  loadActivities: () => Promise<void>
  loadStats: () => Promise<void>
  loadSyncStatus: () => Promise<void>
  /** Re-fetch status/stats; reload activities when data appears or syncedAt changes. */
  pollForUpdates: () => Promise<void>
  updateSettings: (s: Partial<UserSettings>) => void
  loadDetail: (id: number) => Promise<ActivityDetail | null>
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      activities: [],
      stats: null,
      syncStatus: null,
      settings: DEFAULT_SETTINGS,
      loading: false,
      error: null,
      detailCache: {},

      loadActivities: async () => {
        set({ loading: true, error: null })
        try {
          const res = await fetch('/data/activities.json', { cache: 'no-store' })
          if (!res.ok) {
            set({ loading: false, error: `No se encontró /data/activities.json (status ${res.status})`, activities: [] })
            return
          }
          const data: ActivitySummary[] = await res.json()
          data.sort((a, b) => b.startTime.localeCompare(a.startTime))
          set({ activities: data, loading: false, error: null, detailCache: {} })
        } catch (e) {
          set({ loading: false, error: (e as Error).message, activities: [] })
        }
      },

      loadStats: async () => {
        try {
          const res = await fetch('/data/stats.json', { cache: 'no-store' })
          if (!res.ok) return
          const data: GlobalStats = await res.json()
          set({ stats: data })
        } catch {
          // stats are optional
        }
      },

      loadSyncStatus: async () => {
        try {
          const res = await fetch('/data/sync_status.json', { cache: 'no-store' })
          if (!res.ok) return
          const data: SyncStatus = await res.json()
          set({ syncStatus: data })
        } catch {
          // optional
        }
      },

      pollForUpdates: async () => {
        const previousSyncedAt = get().stats?.syncedAt
        const hadActivities = get().activities.length > 0

        await get().loadSyncStatus()

        try {
          const res = await fetch('/data/stats.json', { cache: 'no-store' })
          if (res.ok) {
            const data: GlobalStats = await res.json()
            if (data.syncedAt && data.syncedAt !== previousSyncedAt) {
              set({ stats: data })
              await get().loadActivities()
              return
            }
          }
        } catch {
          // ignore
        }

        // First sync: activities.json may appear before stats.json
        if (!hadActivities) {
          try {
            const res = await fetch('/data/activities.json', { cache: 'no-store' })
            if (res.ok) {
              await get().loadActivities()
              await get().loadStats()
            }
          } catch {
            // ignore
          }
        }
      },

      updateSettings: (s) => {
        set(state => ({ settings: { ...state.settings, ...s } }))
      },

      loadDetail: async (id: number) => {
        const cached = get().detailCache[id]
        if (cached) return cached
        try {
          const res = await fetch(`/data/activity_${id}.json`)
          if (!res.ok) return null
          const detail: ActivityDetail = await res.json()
          set(state => ({ detailCache: { ...state.detailCache, [id]: detail } }))
          return detail
        } catch {
          return null
        }
      },
    }),
    {
      name: 'garmin-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)
