import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // เฉพาะ master_admin เท่านั้น
  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  if (roleData?.role !== 'master_admin') {
    return NextResponse.json({ error: 'เฉพาะ Master Admin เท่านั้น' }, { status: 403 })
  }

  const { targetUserId, newRole } = await req.json()
  if (!targetUserId || !newRole) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'ไม่สามารถเปลี่ยน Role ของตัวเองได้' }, { status: 400 })
  }

  const service = await createServiceSupabase()
  const { error } = await service.from('user_roles').upsert(
    { user_id: targetUserId, role: newRole },
    { onConflict: 'user_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
