import Fuse from 'fuse.js'
import type { Asset } from './supabase'

export function searchAssets(assets: Asset[], query: string): Asset[] {
  if (!query.trim()) return assets
  const fuse = new Fuse(assets, {
    keys: ['name', 'asset_no', 'serial_no', 'emp_id', 'employees.full_name_th', 'employees.full_name_en', 'employees.department', 'brand', 'model'],
    threshold: 0.35,
    includeScore: true,
  })
  return fuse.search(query).map((r) => r.item)
}

export function searchEmployees<T extends { emp_id: string; full_name_th: string; full_name_en?: string; nickname?: string; department?: string; branch?: string }>(employees: T[], query: string): T[] {
  if (!query.trim()) return employees
  const fuse = new Fuse(employees, {
    keys: ['emp_id', 'full_name_th', 'full_name_en', 'nickname', 'department', 'branch'],
    threshold: 0.35,
  })
  return fuse.search(query).map((r) => r.item)
}
