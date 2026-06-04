'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Role } from '@/lib/supabase'

export function useRole() {
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      // ลอง RPC function ก่อน (bypass RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_role')

      if (!rpcError && rpcData) {
        setRole(rpcData as Role)
        setLoading(false)
        return
      }

      // Fallback: query โดยตรง (ใช้ตอน function ยังไม่ได้สร้าง)
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      setRole((data?.role as Role) ?? 'view')
      setLoading(false)
    })
  }, [])

  return { role, userId, loading }
}
