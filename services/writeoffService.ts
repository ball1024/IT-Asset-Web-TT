import { createClient } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import type { Asset } from '@/lib/supabase'

export async function getDamagedAssets(): Promise<Asset[]> {
  const { data, error } = await createClient()
    .from('assets')
    .select('*, employees(full_name_th, full_name_en, department), vendors(id, name)')
    .eq('status', 'damaged')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Asset[]
}

export async function writeoffAsset(assetId: string, performedBy?: string): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()
  await supabase.from('assets').update({ status: 'writeoff', emp_id: null, updated_at: now }).eq('id', assetId)
  await insertAssetLog({ asset_id: assetId, action: 'writeoff', detail: 'ยืนยันตัดจำหน่าย', performed_by: performedBy })
}
