import { createClient } from '@/lib/supabase'
import type { AssetLog } from '@/lib/supabase'

export async function getAssetLogs(assetId: string) {
  const { data, error } = await createClient()
    .from('asset_logs')
    .select('*, repair_requests(case_no)')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((l: any) => ({
    ...l,
    case_no: l.repair_requests?.case_no ?? undefined,
    repair_requests: undefined,
  })) as AssetLog[]
}

export async function getAllLogs() {
  const { data, error } = await createClient()
    .from('asset_logs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AssetLog[]
}

export async function getAllAssetLogsWithAssets() {
  const { data, error } = await createClient()
    .from('asset_logs')
    .select('*, assets(asset_no, name), repair_requests(case_no)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []).map((l: any) => ({
    ...l,
    case_no: l.repair_requests?.case_no ?? undefined,
    repair_requests: undefined,
  }))
}

export async function getAllEmployeeLogs() {
  const { data, error } = await createClient()
    .from('employee_logs')
    .select('*, employees(emp_id, full_name_th)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data ?? []
}
