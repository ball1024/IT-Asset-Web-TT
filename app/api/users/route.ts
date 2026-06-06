import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const ids: string[] = body?.ids

  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({})
  if (ids.length > 100) return NextResponse.json({ error: 'Too many ids' }, { status: 400 })
  if (!ids.every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: 'Invalid id format' }, { status: 400 })
  }

  const service = await createServiceSupabase()
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 })

  const users: Record<string, string> = {}
  const emails: Record<string, string> = {}

  for (const u of data?.users ?? []) {
    if (ids.includes(u.id)) {
      users[u.id] = u.user_metadata?.full_name || u.email || u.id.slice(0, 8)
      emails[u.id] = u.email ?? ''
    }
  }

  return NextResponse.json({ users, emails })
}
