'use client'
import type { Role } from '@/lib/supabase'
import RoleBadge from './RoleBadge'

const ROLES: Role[] = ['master_admin', 'admin', 'user', 'view']

interface Member {
  id: string
  email: string
  full_name?: string
  role: Role
  created_at: string
  last_sign_in_at?: string
}

interface Props {
  members: Member[]
  currentUserId: string
  onRoleChange: (userId: string, role: Role) => void
  readOnly?: boolean
}

export default function MemberTable({ members, currentUserId, onRoleChange, readOnly }: Props) {
  const headers = ['ชื่อ / Email', 'Role', 'วันที่สมัคร', 'Login ล่าสุด', ...(!readOnly ? ['เปลี่ยน Role'] : [])]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-800">{m.full_name || '-'}</p>
                <p className="text-xs text-gray-400">{m.email}</p>
              </td>
              <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
              <td className="px-4 py-3 text-gray-500 text-xs">{new Date(m.created_at).toLocaleDateString('th-TH')}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleString('th-TH') : '-'}</td>
              {!readOnly && (
                <td className="px-4 py-3">
                  {m.role === 'master_admin' && m.id === currentUserId ? (
                    <span className="text-xs text-gray-400">ไม่สามารถเปลี่ยนได้</span>
                  ) : (
                    <select value={m.role}
                      onChange={e => onRoleChange(m.id, e.target.value as Role)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
              )}
            </tr>
          ))}
          {!members.length && (
            <tr><td colSpan={headers.length} className="text-center py-10 text-gray-400">ไม่พบสมาชิก</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
