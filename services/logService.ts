import { createClient } from '@/lib/supabase'
import type { AssetLog } from '@/lib/supabase'

export async function getAssetLogs(assetId: string) {
  const { data, error } = await createClient()
    .from('asset_logs')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AssetLog[]
}

export async function getAllLogs() {
  const { data, error } = await createClient()
    .from('asset_logs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AssetLog[]
}
