import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type Role = 'master_admin' | 'admin' | 'user' | 'view'

export interface UserRole {
  id: string
  user_id: string
  role: Role
}

export interface Employee {
  emp_id: string
  full_name_th: string
  full_name_en?: string
  nickname?: string
  department?: string
  position?: string
  branch?: string
  emp_email?: string
  phone?: string
  status: 'active' | 'probation' | 'resign'
  created_at?: string
  updated_at?: string
}

export interface Asset {
  id: string
  asset_no: string
  name: string
  category: string
  brand?: string
  model?: string
  serial_no?: string
  status: 'available' | 'issued' | 'returned' | 'damaged' | 'repair' | 'writeoff' | 'hold' | 'spare'
  location?: string
  purchase_date?: string
  received_date?: string
  original_price?: number
  notes?: string
  images: string[]
  emp_id?: string
  department?: string
  vendor_id?: string
  apple_id?: string
  created_by?: string
  created_at?: string
  updated_at?: string
  employees?: Employee
  vendors?: Vendor
}

export interface Vendor {
  id: string
  name: string
  contact_name?: string
  phone?: string
  email?: string
  website?: string
  notes?: string
  created_at?: string
}

export interface AssetLicense {
  id: string
  asset_id: string
  name: string
  license_key?: string
  notes?: string
  created_by?: string
  created_at?: string
}

export interface AssetLog {
  id: string
  asset_id: string
  action: string
  detail?: string
  performed_by?: string
  repair_request_id?: string
  created_at: string
}

export type RepairStatus = 'pending' | 'in_progress' | 'resolved'
export type RepairResolution = 'repaired' | 'replaced_spare' | 'replaced_new' | 'waiting_new'

export interface RepairRequest {
  id: string
  asset_id: string
  reported_by?: string
  issue: string
  status: RepairStatus
  spare_asset_id?: string
  resolution?: RepairResolution
  resolved_by?: string
  notes?: string
  reported_at: string
  resolved_at?: string
  // joined
  assets?: Pick<Asset, 'id' | 'asset_no' | 'name' | 'category'>
  spare_asset?: Pick<Asset, 'id' | 'asset_no' | 'name'>
}
