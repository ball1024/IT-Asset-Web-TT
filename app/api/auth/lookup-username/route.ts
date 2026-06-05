import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { username } = await req.json()
  if (!username) return NextResponse.json({ error: 'missing username' }, { status: 400 })

  const supabase = await createServiceSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('username', username.toLowerCase().trim())
    .single()

  if (error || !data) return NextResponse.json({ error: 'ไม่พบ Username นี้ในระบบ' }, { status: 404 })
  return NextResponse.json({ email: data.email })
}
