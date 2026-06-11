/**
 * Google Apps Script — IT Asset Sync
 * ติดตั้งใน Google Sheet: Extensions → Apps Script → วาง code นี้ → Save → Deploy
 *
 * ต้องแก้ค่า 2 ตัวด้านล่างก่อน:
 */

const WEBHOOK_URL    = 'https://your-domain.com/api/sheets-sync'  // เปลี่ยนเป็น URL จริง
const WEBHOOK_SECRET = 'it-asset-sync-secret-2569'                // ต้องตรงกับ .env.local

// ── Column index ของ Asset-Running (I = index 8, 0-based) ──────────────────
const ASSET_NO_COL = 8  // column I

/**
 * Trigger อัตโนมัติเมื่อมีการแก้ไขใน Sheet
 * ต้องตั้ง trigger: Triggers → Add Trigger → onEdit → From spreadsheet → On edit
 */
function onSheetEdit(e) {
  const sheet = e.source.getActiveSheet()
  const row   = e.range.getRow()
  const col   = e.range.getColumn()

  // ข้ามแถว header (row 1) และ column ที่ไม่เกี่ยวข้อง
  if (row <= 1) return

  // ดึงข้อมูลทั้งแถวที่แก้ไข
  const lastCol  = sheet.getLastColumn()
  const rowData  = sheet.getRange(row, 1, 1, lastCol).getValues()[0]
  const assetNo  = rowData[ASSET_NO_COL]

  // ถ้าไม่มี Asset No. ข้ามไปเลย
  if (!assetNo || assetNo.toString().trim() === '') return

  // ส่ง webhook ไป Next.js
  try {
    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        secret:  WEBHOOK_SECRET,
        assetNo: assetNo.toString().trim(),
        row:     rowData.map(v => v === null || v === undefined ? '' : v.toString()),
      }),
      muteHttpExceptions: true,
    })
  } catch (err) {
    console.error('Sheets sync error:', err)
  }
}

/**
 * Manual full-sync: เรียกจาก Apps Script editor โดยตรง
 * Run → fullSync() เพื่อ sync ทั้งหมดครั้งแรก
 */
function fullSync() {
  const url = WEBHOOK_URL + '?secret=' + WEBHOOK_SECRET
  const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true })
  Logger.log('Full sync result: ' + res.getContentText())
}
