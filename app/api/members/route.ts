import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // เช็ค role — admin ขึ้นไปดูได้
  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  const role = roleData?.role ?? 'view'
  if (!['master_admin', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceSupabase()
  const { data: rolesData } = await service.from('user_roles').select('user_id, role')
  const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })

  const roleMap = Object.fromEntries((rolesData ?? []).map(r => [r.user_id, r.role]))
  const members = (users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email,
    full_name: u.user_metadata?.full_name ?? '',
    role: roleMap[u.id] ?? 'view',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }))

  return NextResponse.json({ members, currentRole: role })
}
