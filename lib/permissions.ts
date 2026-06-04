import type { Role } from './supabase'

const ROLE_LEVEL: Record<Role, number> = {
  view: 0,
  user: 1,
  admin: 2,
  master_admin: 3,
}

export function hasRole(userRole: Role | null | undefined, required: Role): boolean {
  if (!userRole) return false
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

export function canEdit(role: Role | null | undefined) { return hasRole(role, 'user') }
export function canDelete(role: Role | null | undefined) { return hasRole(role, 'admin') }
export function canTransfer(role: Role | null | undefined) { return hasRole(role, 'user') }
export function canViewEmployees(role: Role | null | undefined) { return hasRole(role, 'user') }
export function canManageEmployees(role: Role | null | undefined) { return hasRole(role, 'user') }
export function canDeleteEmployee(role: Role | null | undefined) { return role === 'master_admin' }
export function canViewMembers(role: Role | null | undefined) { return hasRole(role, 'admin') }
export function canManageMembers(role: Role | null | undefined) { return role === 'master_admin' }
export function canImportExport(role: Role | null | undefined) { return hasRole(role, 'user') }
export function canAccessSettings(role: Role | null | undefined) { return hasRole(role, 'admin') }
