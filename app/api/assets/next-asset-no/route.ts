import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'

/**
 * GET /api/assets/next-asset-no?catCode=01&year=69&month=06
 * คืนเลข running ถัดไปสำหรับ year+category (reset ทุกปีและทุก category)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const catCode = searchParams.get('catCode')?.padStart(2, '0')
  const year    = searchParams.get('year')
  const month   = searchParams.get('month')?.padStart(2, '0') ?? (new Date().getMonth() + 1).toString().padStart(2, '0')

  if (!catCode || !year) {
    return NextResponse.json({ error: 'catCode and year are required' }, { status: 400 })
  }

  const supabase = await createServiceSupabase()

  // ดึง asset_no ทั้งหมดที่ขึ้นด้วย IT-YY (ปีเดียวกัน) และ catCode เดียวกัน
  // pattern: IT-69xx-01-xxxx
  const { data, error } = await supabase
    .from('assets')
    .select('asset_no')
    .like('asset_no', `IT-${year}%-${catCode}-%`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let maxRunning = 0
  for (const row of data ?? []) {
    const parts = row.asset_no?.split('-')
    if (parts?.length === 4) {
      const running = parseInt(parts[3], 10)
      if (!isNaN(running) && running > maxRunning) maxRunning = running
    }
  }

  const nextRunning = maxRunning + 1
  const paddedRunning = nextRunning.toString().padStart(4, '0')
  const assetNo = `IT-${year}${month}-${catCode}-${paddedRunning}`

  return NextResponse.json({ nextRunning, assetNo })
}
