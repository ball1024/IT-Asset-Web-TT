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
  repair_requests?: Pick<RepairRequest, 'case_no' | 'status'>[]
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
  case_no?: string
  created_at: string
}

export type ConditionRating = 'new' | 'good' | 'fair' | 'poor'

export interface ConditionCheck {
  id: string
  asset_id: string
  check_type: 'handover' | 'return'
  overall_condition?: ConditionRating
  condition_items: Record<string, ConditionRating>
  item_details: Record<string, string>
  // เช่น { battery_pct: "85", screen_detail: "scratch", body_detail: "minor_scratch" }
  accessories: Record<string, boolean>
  notes?: string
  performed_by?: string
  emp_id?: string
  created_at: string
}

export const CONDITION_ITEMS_BY_CATEGORY: Record<string, string[]> = {
  notebook:   ['battery', 'screen', 'keyboard', 'body', 'ports'],
  macbook:    ['battery', 'screen', 'keyboard', 'body', 'ports'],
  laptop:     ['battery', 'screen', 'keyboard', 'body', 'ports'],
  'pc desktop': ['screen', 'keyboard', 'mouse', 'body', 'cables'],
  desktop:    ['screen', 'keyboard', 'mouse', 'body', 'cables'],
  imac:       ['screen', 'keyboard', 'mouse', 'body', 'cables'],
  android:    ['battery', 'screen', 'body', 'charger'],
  ios:        ['battery', 'screen', 'body', 'charger'],
  mobile:     ['battery', 'screen', 'body', 'charger'],
  ipad:       ['battery', 'screen', 'body', 'charger'],
  tablet:     ['battery', 'screen', 'body', 'charger'],
  monitor:    ['screen', 'body', 'cables'],
  default:    ['body'],
}

export const ACCESSORIES_BY_CATEGORY: Record<string, string[]> = {
  notebook:   ['adapter', 'bag', 'mouse'],
  macbook:    ['adapter'],
  laptop:     ['adapter', 'bag', 'mouse'],
  'pc desktop': ['monitor_cable', 'power_cable', 'keyboard', 'mouse'],
  desktop:    ['monitor_cable', 'power_cable'],
  imac:       ['keyboard', 'mouse', 'power_cable'],
  android:    ['charger', 'case'],
  ios:        ['charger', 'case'],
  mobile:     ['charger', 'case'],
  ipad:       ['charger', 'case', 'keyboard'],
  tablet:     ['charger', 'case', 'keyboard'],
  default:    [],
}

export const CONDITION_ITEM_LABELS: Record<string, string> = {
  battery: 'แบตเตอรี่', screen: 'จอภาพ', keyboard: 'แป้นพิมพ์',
  body: 'สภาพตัวเครื่อง', ports: 'พอร์ต/ช่องเสียบ', mouse: 'เมาส์',
  cables: 'สายเคเบิล', charger: 'ที่ชาร์จ',
}

export const ACCESSORY_LABELS: Record<string, string> = {
  adapter: 'อะแดปเตอร์', bag: 'กระเป๋า', mouse: 'เมาส์',
  monitor_cable: 'สายจอ', power_cable: 'สายไฟ',
  keyboard: 'คีย์บอร์ด', charger: 'สายชาร์จ', case: 'เคส',
}

export type RepairStatus = 'pending' | 'in_progress' | 'resolved'
export type RepairResolution = 'repaired' | 'replaced_spare' | 'replaced_new' | 'waiting_new'

export interface RepairRequest {
  id: string
  asset_id: string
  case_no?: string
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
