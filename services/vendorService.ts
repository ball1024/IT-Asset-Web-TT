import { createClient } from '@/lib/supabase'
import type { Vendor } from '@/lib/supabase'

export async function getVendors() {
  const { data, error } = await createClient()
    .from('vendors')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as Vendor[]
}

export async function getVendorById(id: string) {
  const { data, error } = await createClient()
    .from('vendors')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Vendor
}

export async function createVendor(payload: Omit<Vendor, 'id' | 'created_at'>) {
  const { data, error } = await createClient()
    .from('vendors')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Vendor
}

export async function updateVendor(id: string, payload: Partial<Vendor>) {
  const { error } = await createClient()
    .from('vendors')
    .update(payload)
    .eq('id', id)
  if (error) throw error
}

export async function deleteVendor(id: string) {
  const { error } = await createClient()
    .from('vendors')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getVendorAssetCounts(): Promise<Record<string, number>> {
  const { data } = await createClient()
    .from('assets')
    .select('vendor_id')
    .not('vendor_id', 'is', null)
  const counts: Record<string, number> = {}
  ;(data ?? []).forEach((a: any) => {
    if (a.vendor_id) counts[a.vendor_id] = (counts[a.vendor_id] ?? 0) + 1
  })
  return counts
}
