import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-server'
import { sheetRowToAsset } from '@/services/sheetsService'
import { COL } from '@/lib/googleSheets'

/**
 * POST /api/sheets-sync
 * รับ webhook จาก Google Apps Script เมื่อมีการแก้ไข Sheets
 * Body: { secret: string, row: string[], assetNo: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { secret, row, assetNo } = body

    // ตรวจสอบ secret token
    if (secret !== process.env.SHEETS_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!Array.isArray(row) || !assetNo) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const partial = sheetRowToAsset(row as string[])

    if (!partial.asset_no) {
      return NextResponse.json({ error: 'asset_no is required' }, { status: 400 })
    }

    const supabase = await createServiceSupabase()

    // ดึง asset เดิมโดยใช้ asset_no
    const { data: existing } = await supabase
      .from('assets')
      .select('id')
      .eq('asset_no', partial.asset_no)
      .maybeSingle()

    if (existing?.id) {
      // อัพเดต
      const { error } = await supabase
        .from('assets')
        .update({ ...partial, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (error) throw error

      return NextResponse.json({ action: 'updated', id: existing.id })
    } else {
      // สร้างใหม่
      const { data, error } = await supabase
        .from('assets')
        .insert({ ...partial, images: [], created_by: null })
        .select('id')
        .single()

      if (error) throw error

      return NextResponse.json({ action: 'created', id: data.id })
    }
  } catch (err: any) {
    console.error('[sheets-sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/sheets-sync
 * Manual full-sync: ดึงข้อมูลทั้งหมดจาก Sheets แล้ว upsert ลง Supabase
 * ใช้ตอน setup ครั้งแรก หรือกด "Sync ทั้งหมด" จากหน้า Admin
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const userId = req.nextUrl.searchParams.get('userId') || null

  if (secret !== process.env.SHEETS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { getAllSheetRows, sheetRowToAsset } = await import('@/services/sheetsService')
    const rows     = await getAllSheetRows()
    const supabase = await createServiceSupabase()

    // เก็บ asset_no ทั้งหมดที่มีใน Sheets
    const sheetAssetNos = new Set(
      rows.map(r => (r[COL.ASSET_NO] ?? '').toString().trim()).filter(Boolean)
    )

    // ลบ assets ที่ไม่มีใน Sheets แล้ว
    let deleted = 0
    const { data: allAssets } = await supabase.from('assets').select('id, asset_no')
    for (const a of allAssets ?? []) {
      if (!sheetAssetNos.has(a.asset_no)) {
        // เซ็ต asset_id = null ใน logs ก่อน เพื่อไม่ให้ log ถูกลบตาม
        await supabase.from('asset_logs').update({ asset_id: null }).eq('asset_id', a.id)
        await supabase.from('assets').delete().eq('id', a.id)
        deleted++
      }
    }

    let created = 0, updated = 0, skipped = 0
    const errors: string[] = []
    const skippedRows: { rowIndex: number; reason: string; preview: string }[] = []
    const logEntries: object[] = []

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]
      const partial = sheetRowToAsset(row)
      if (!partial.asset_no) {
        skipped++
        skippedRows.push({
          rowIndex: ri + 2, // +2 เพราะ header=row1, data เริ่ม row2
          reason: 'ไม่มี Asset No.',
          preview: (row[COL.NAME] ?? row[COL.SERIAL_NO] ?? '').toString().trim().slice(0, 40) || '(ว่าง)',
        })
        continue
      }

      // ถ้า emp_id ไม่มีใน employees ให้ใส่ null แทน (ป้องกัน FK violation)
      if (partial.emp_id) {
        const { data: emp } = await supabase
          .from('employees')
          .select('emp_id')
          .eq('emp_id', partial.emp_id)
          .maybeSingle()
        if (!emp) partial.emp_id = undefined
      }

      const { data: existing } = await supabase
        .from('assets')
        .select('id')
        .eq('asset_no', partial.asset_no)
        .maybeSingle()

      if (existing?.id) {
        const { error } = await supabase
          .from('assets')
          .update({ ...partial, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) errors.push(`update ${partial.asset_no}: ${error.message}`)
        else {
          updated++
          logEntries.push({ asset_id: existing.id, action: 'sheets_sync', detail: 'updated from Google Sheets', performed_by: userId })
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('assets')
          .insert({ ...partial, images: [], created_by: userId })
          .select('id')
          .single()
        if (error) errors.push(`insert ${partial.asset_no}: ${error.message}`)
        else {
          created++
          logEntries.push({ asset_id: inserted.id, action: 'sheets_sync', detail: 'created from Google Sheets', performed_by: userId })
        }
      }
    }

    // บันทึก log การ sync ทั้งหมด
    if (logEntries.length > 0) {
      await supabase.from('asset_logs').insert(logEntries)
    }

    return NextResponse.json({ ok: true, created, updated, deleted, skipped, skippedRows, errors })
  } catch (err: any) {
    console.error('[sheets-sync GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
