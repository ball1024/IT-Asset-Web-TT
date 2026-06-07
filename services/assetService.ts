import { createClient } from '@/lib/supabase'
import type { Asset } from '@/lib/supabase'

export async function getAssets() {
  const { data, error } = await createClient()
    .from('assets')
    .select(`
      id, asset_no, name, category, brand, model, serial_no,
      status, location, purchase_date, received_date, original_price,
      notes, images, emp_id, department, vendor_id, created_by, created_at, updated_at,
      employees(full_name_th, full_name_en, department),
      vendors(id, name),
      repair_requests!repair_requests_asset_id_fkey(case_no, status)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Asset[]
}

export async function getAssetById(id: string) {
  const { data, error } = await createClient()
    .from('assets')
    .select('*, employees(*), vendors(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Asset
}

export async function createAsset(payload: Partial<Asset> & { created_by: string }) {
  const { data, error } = await createClient()
    .from('assets')
    .insert({ ...payload, images: [] })
    .select()
    .single()
  if (error) throw error
  return data as Asset
}

export async function updateAsset(id: string, payload: Omit<Partial<Asset>, 'emp_id'> & { emp_id?: string | null }) {
  const { error } = await createClient()
    .from('assets')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAsset(id: string) {
  const { error } = await createClient()
    .from('assets')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function checkAssetNoExists(assetNo: string, excludeId?: string) {
  let query = createClient().from('assets').select('id').eq('asset_no', assetNo.trim())
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query.maybeSingle()
  return !!data
}

export async function updateAssetImages(id: string, images: string[]) {
  const { error } = await createClient()
    .from('assets')
    .update({ images })
    .eq('id', id)
  if (error) throw error
}
