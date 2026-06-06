import { createClient } from './supabase'

export async function insertAssetLog(payload: {
  asset_id: string
  action: string
  performed_by?: string | null
  detail?: string
  repair_request_id?: string
}) {
  await createClient().from('asset_logs').insert(payload)
}

export async function insertEmployeeLog(payload: {
  emp_id: string
  action: string
  performed_by?: string | null
  detail?: string
}) {
  await createClient().from('employee_logs').insert(payload)
}
