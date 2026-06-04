'use client'
import { useEffect, useState, useCallback } from 'react'
import type { Role } from '@/lib/supabase'
import MemberTable from '@/components/members/MemberTable'
import Toast, { type ToastData } from '@/components/ui/Toast'
import { useRole } from '@/hooks/useRole'
import { canViewMembers, canManageMembers } from '@/lib/permissions'

interface Member {
  id: string; email: string; full_name: string; role: Role
  created_at: string; last_sign_in_at?: string
}

export default function MembersContent() {
  const { role, userId, loading: roleLoading } = useRole()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then(({ members }) => { setMembers(members ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (roleLoading) return <div className="text-gray-400 dark:text-gray-500 text-sm p-4">Loading...</div>

  if (!canViewMembers(role)) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-gray-600 dark:text-gray-300 font-medium">ไม่มีสิทธิ์เข้าถึง</p>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">เฉพาะ Admin ขึ้นไปเท่านั้น</p>
    </div>
  )

  const changeRole = async (targetUserId: string, newRole: Role) => {
    const res = await fetch('/api/members/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, newRole }),
    })
    const json = await res.json()

    if (!res.ok) {
      showToast(json.error ?? 'เปลี่ยน Role ไม่สำเร็จ', 'error')
      return
    }

    setMembers(m => m.map(x => x.id === targetUserId ? { ...x, role: newRole } : x))
    showToast('เปลี่ยน Role สำเร็จ', 'success')
  }

  const isMasterAdmin = canManageMembers(role)

  return (
    <>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Members</h2>
          {!isMasterAdmin && (
            <span className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 px-2.5 py-1 rounded-full">
              ดูได้อย่างเดียว — เปลี่ยน Role ได้เฉพาะ Master Admin
            </span>
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading...' : `${members.length} คน`}
          </div>
          <MemberTable
            members={members}
            currentUserId={userId ?? ''}
            onRoleChange={changeRole}
            readOnly={!isMasterAdmin}
          />
        </div>
      </div>
    </>
  )
}
