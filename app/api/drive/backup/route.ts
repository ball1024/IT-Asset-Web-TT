import { NextRequest, NextResponse } from 'next/server'
import { backupImageToDrive } from '@/lib/googleDrive'

/**
 * POST /api/drive/backup
 * รับ multipart/form-data: { file: Blob, assetNo: string, filename: string }
 * Upload รูปขึ้น Google Drive เป็น backup (fire-and-forget จาก client)
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_EMAIL) {
    return NextResponse.json({ ok: false, reason: 'Drive not configured' })
  }

  try {
    const form     = await req.formData()
    const file     = form.get('file') as File | null
    const assetNo  = (form.get('assetNo') as string | null)?.trim()
    const filename = (form.get('filename') as string | null)?.trim() ?? file?.name ?? 'image.webp'

    if (!file || !assetNo) {
      return NextResponse.json({ error: 'file and assetNo are required' }, { status: 400 })
    }

    const buffer  = Buffer.from(await file.arrayBuffer())
    const result  = await backupImageToDrive(buffer, filename, assetNo, file.type || 'image/webp')

    return NextResponse.json({ ok: true, fileId: result?.id, link: result?.webViewLink })
  } catch (err: any) {
    console.error('[drive/backup]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
