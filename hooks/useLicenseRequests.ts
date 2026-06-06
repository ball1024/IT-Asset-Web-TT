'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export interface LicenseRequest {
  id: string
  license_id: string
  requested_by: string
  granted_by?: string
  status: 'pending' | 'approved' | 'rejected'
  approved_at?: string
  created_at: string
  asset_licenses?: { name: string; asset_id: string }
}

// Hook สำหรับ admin/master_admin — ดู pending requests ของคนอื่น
export function useLicenseRequests(isAdmin: boolean) {
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingList, setPendingList] = useState<LicenseRequest[]>([])
  const [newRequest, setNewRequest] = useState<LicenseRequest | null>(null)

  const loadPending = useCallback(async () => {
    if (!isAdmin) return
    const { data, count } = await createClient()
      .from('license_view_requests')
      .select('*, asset_licenses(name, asset_id)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingCount(count ?? 0)
    setPendingList((data ?? []) as LicenseRequest[])
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    loadPending()

    const supabase = createClient()
    const channel = supabase
      .channel('license-requests-admin')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'license_view_requests',
      }, async (payload) => {
        const { data } = await createClient()
          .from('license_view_requests')
          .select('*, asset_licenses(name, asset_id)')
          .eq('id', payload.new.id)
          .single()
        if (data) setNewRequest(data as LicenseRequest)
        loadPending()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isAdmin, loadPending])

  const clearNewRequest = () => setNewRequest(null)
  return { pendingCount, pendingList, newRequest, clearNewRequest, reload: loadPending }
}

// Hook สำหรับ user — ดูสถานะคำขอของตัวเอง
export function useMyLicenseNotifications(userId: string | null) {
  const [myUpdates, setMyUpdates] = useState<LicenseRequest[]>([])
  const [latestUpdate, setLatestUpdate] = useState<LicenseRequest | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await createClient()
      .from('license_view_requests')
      .select('*, asset_licenses(name, asset_id)')
      .eq('requested_by', userId)
      .order('created_at', { ascending: false })
    setMyUpdates((data ?? []) as LicenseRequest[])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    load()

    const supabase = createClient()
    const channel = supabase
      .channel(`license-requests-user-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'license_view_requests',
        filter: `requested_by=eq.${userId}`,
      }, async (payload) => {
        if (payload.new.status === 'approved' || payload.new.status === 'rejected') {
          const { data } = await createClient()
            .from('license_view_requests')
            .select('*, asset_licenses(name, asset_id)')
            .eq('id', payload.new.id)
            .single()
          if (data) setLatestUpdate(data as LicenseRequest)
          load()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, load])

  const clearLatestUpdate = () => setLatestUpdate(null)
  return { myUpdates, latestUpdate, clearLatestUpdate, reload: load }
}
