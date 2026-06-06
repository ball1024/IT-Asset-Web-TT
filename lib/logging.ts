import { createClient } from './supabase'

function isLoggingEnabled(): boolean {
  try {
    return localStorage.getItem('logging_enabled') !== 'false'
  } catch {
    return true
  }
}

export async function insertAssetLog(payload: {
  asset_id: string
  action: string
  performed_by?: string | null
  detail?: string
  repair_request_id?: string
}) {
  if (!isLoggingEnabled()) return
  await createClient().from('asset_logs').insert(payload)
}

export async function insertEmployeeLog(payload: {
  emp_id: string
  action: string
  performed_by?: string | null
  detail?: string
}) {
  if (!isLoggingEnabled()) return
  await createClient().from('employee_logs').insert(payload)
}
