import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: string[] }
  if (!ids?.length) return NextResponse.json({})

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
