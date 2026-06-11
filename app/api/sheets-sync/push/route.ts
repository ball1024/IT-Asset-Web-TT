import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'
import { syncAssetToSheet } from '@/services/sheetsService'

/**
 * POST /api/sheets-sync/push
 * เรียกจาก AssetForm หลัง save สำเร็จ → sync asset ไป Google Sheets
 * Body: { assetId: string }
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SHEET_ID) {
    return NextResponse.json({ ok: false, reason: 'GOOGLE_SHEET_ID not configured' })
  }

  try {
    const { assetId } = await req.json()
    if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 })

    const supabase = await createServiceSupabase()
    const { data: asset, error } = await supabase
      .from('assets')
      .select('*, employees(*)')
      .eq('id', assetId)
      .single()

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    await syncAssetToSheet(asset)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[sheets-sync/push]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
