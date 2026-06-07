import { createClient } from '@/lib/supabase'
import type { AssetLicense } from '@/lib/supabase'

export async function getLicensesByAsset(assetId: string) {
  const { data, error } = await createClient()
    .from('asset_licenses')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as AssetLicense[]
}

export async function createLicense(payload: Omit<AssetLicense, 'id' | 'created_at'>) {
  const { data, error } = await createClient()
    .from('asset_licenses')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as AssetLicense
}

export async function updateLicense(id: string, payload: Partial<AssetLicense>) {
  const { error } = await createClient()
    .from('asset_licenses')
    .update(payload)
    .eq('id', id)
  if (error) throw error
}

export async function deleteLicense(id: string) {
  const { error } = await createClient()
    .from('asset_licenses')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getMyLicenseRequests(userId: string) {
  const { data, error } = await createClient()
    .from('license_view_requests')
    .select('license_id, status, approved_at')
    .eq('requested_by', userId)
  if (error) throw error
  return data ?? []
}

export async function upsertLicenseRequest(licenseId: string, userId: string) {
  const { error } = await createClient()
    .from('license_view_requests')
    .upsert(
      { license_id: licenseId, requested_by: userId, status: 'pending' },
      { onConflict: 'license_id,requested_by' }
    )
  if (error) throw error
}

export async function approveLicenseRequest(id: string, grantedBy: string) {
  const { error } = await createClient()
    .from('license_view_requests')
    .update({ status: 'approved', granted_by: grantedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function rejectLicenseRequest(id: string) {
  const { error } = await createClient()
    .from('license_view_requests')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) throw error
}

export async function getLicenseRequests() {
  const { data, error } = await createClient()
    .from('license_view_requests')
    .select('*, asset_licenses(name, asset_id, assets(asset_no, name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function deleteLicenseRequests(licenseIds: string[], userId: string) {
  const { error } = await createClient()
    .from('license_view_requests')
    .delete()
    .in('license_id', licenseIds)
    .eq('requested_by', userId)
  if (error) throw error
}
