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
  status: 'active' | 'repair' | 'storage' | 'retired'
  location?: string
  purchase_date?: string
  notes?: string
  images: string[]
  emp_id?: string
  created_by?: string
  created_at?: string
  updated_at?: string
  employees?: Employee
}

export interface AssetLog {
  id: string
  asset_id: string
  action: string
  detail?: string
  performed_by?: string
  created_at: string
}
