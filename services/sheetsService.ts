import {
  getSheetsClient, SPREADSHEET_ID, SHEET_NAME, COL, parseAssetNo,
  CATEGORY_CODE_MAP,
} from '@/lib/googleSheets'
import type { Asset } from '@/lib/supabase'

// ── helpers ──────────────────────────────────────────────────────────────────

const g = (row: string[], i: number) => (row[i] ?? '').toString().trim()

const VALID_STATUSES = new Set(['available','issued','returned','damaged','repair','writeoff','hold','spare'])

// map สถานะภาษาไทยจาก Sheets → ค่า status ในระบบ
const STATUS_FROM_SHEET: Record<string, string> = {
  'ใช้งานอยู่':  'issued',
  'ใช้งาน':      'issued',
  'จ่ายแล้ว':    'issued',
  'จ่าย':        'issued',
  'ว่าง':        'available',
  'คืนแล้ว':     'returned',
  'รับคืน':      'returned',
  'ชำรุด':       'damaged',
  'ส่งซ่อม':     'repair',
  'ซ่อม':        'repair',
  'write off':   'writeoff',
  'writeoff':    'writeoff',
  'ตัดจำหน่าย':  'writeoff',
  'hold':        'hold',
  'พัก':         'hold',
  'spare':       'spare',
  'สำรอง':       'spare',
}

function mapStatus(raw: string): string {
  if (!raw) return 'available'
  const lower = raw.toLowerCase().trim()
  const mapped = STATUS_FROM_SHEET[lower] ?? STATUS_FROM_SHEET[raw]
  if (mapped) return mapped
  // ถ้าเป็น valid status อยู่แล้ว (เช่น sync จากเว็บ) ให้ใช้ตรงๆ
  if (VALID_STATUSES.has(lower)) return lower
  // fallback ปลอดภัย แทนที่จะใส่ค่า garbage ลง DB
  return 'available'
}

// map category จาก Sheets → ชื่อที่ระบบใช้
// รองรับทั้งภาษาไทย, code เช่น "01", และชื่อภาษาอังกฤษ
const CATEGORY_TH: Record<string, string> = {
  'โน้ตบุ๊ก':   'Notebook',
  'โน้ตบุค':    'Notebook',
  'แล็ปท็อป':   'Notebook',
  'laptop':     'Notebook',
  'macbook':    'MacBook',
  'แมคบุ๊ก':    'MacBook',
  'pc':         'PC Desktop',
  'เดสก์ท็อป':  'PC Desktop',
  'desktop':    'PC Desktop',
  'imac':       'iMac',
  'แมค':        'iMac',
  'android':    'Android',
  'แอนดรอยด์': 'Android',
  'มือถือ':     'Android',
  'ios':        'iOS',
  'iphone':     'iOS',
  'ไอโฟน':     'iOS',
  'ipad':       'iPad',
  'ไอแพด':     'iPad',
  'จอ':         'Monitor',
  'monitor':    'Monitor',
  'จอมอนิเตอร์':'Monitor',
  'printer':    'Printer',
  'เครื่องพิมพ์': 'Printer',
  'ปริ้นเตอร์':  'Printer',
  'tv':         'TV',
  'ทีวี':       'TV',
  'network':    'Network',
  'เน็ตเวิร์ก':  'Network',
  'อุปกรณ์เครือข่าย': 'Network',
  'other':      'Other',
  'อื่นๆ':      'Other',
}

// valid category names ในระบบ (ตรงกับ CATEGORIES ใน AssetForm)
const VALID_CATEGORIES = new Set([
  'Notebook','MacBook','PC Desktop','iMac','Android','iOS','iPad',
  'Monitor','Printer','TV','Network','Other',
])

function mapCategory(raw: string): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  // ถ้าตรงกับ valid category แล้ว (case-insensitive)
  const found = [...VALID_CATEGORIES].find(c => c.toLowerCase() === trimmed.toLowerCase())
  if (found) return found
  // ลอง map จาก category code (01-12)
  if (CATEGORY_CODE_MAP[trimmed]) return CATEGORY_CODE_MAP[trimmed]
  // ลอง map จากภาษาไทย/ชื่อย่อ
  return CATEGORY_TH[trimmed.toLowerCase()] ?? undefined
}

// ── convert Sheet row → Supabase partial asset ───────────────────────────────

export function sheetRowToAsset(row: string[]): Partial<Asset> {
  const rawPrice = g(row, COL.PRICE).replace(/,/g, '')
  const rawQty   = g(row, COL.QUANTITY)
  const rawRepair = g(row, COL.REPAIR_COUNT)

  return {
    asset_no:        g(row, COL.ASSET_NO)        || undefined,
    name:            g(row, COL.NAME)             || undefined,
    brand:           g(row, COL.BRAND)            || undefined,
    serial_no:       g(row, COL.SERIAL_NO)        || undefined,
    location:        g(row, COL.LOCATION)         || undefined,
    received_date:   g(row, COL.RECEIVED_DATE)    || undefined,
    original_price:  rawPrice ? parseFloat(rawPrice) : undefined,
    category:        mapCategory(g(row, COL.CATEGORY)),
    notes:           g(row, COL.NOTES)            || undefined,
    status:          mapStatus(g(row, COL.STATUS)) as Asset['status'],
    emp_id:          g(row, COL.EMP_ID)           || undefined,
    department:      g(row, COL.DEPARTMENT)       || undefined,
    // new fields
    account_category: g(row, COL.ACCOUNT_CAT)    || 'IT',
    stored_at:       g(row, COL.STORED_AT)        || undefined,
    cpu:             g(row, COL.CPU)              || undefined,
    ram:             g(row, COL.RAM)              || undefined,
    storage_spec:    g(row, COL.STORAGE)          || undefined,
    mac_ethernet:    g(row, COL.MAC_ETH)          || undefined,
    mac_wifi:        g(row, COL.MAC_WIFI)         || undefined,
    branch:          g(row, COL.BRANCH)           || undefined,
    quantity:        rawQty    ? parseInt(rawQty, 10)    : 1,
    repair_count:    rawRepair ? parseInt(rawRepair, 10) : 0,
  } as Partial<Asset>
}

// ── convert Supabase asset → Sheet row (34 columns) ──────────────────────────

export function assetToSheetRow(asset: Asset & { employees?: any }): string[] {
  const parsed  = parseAssetNo(asset.asset_no)
  const emp     = asset.employees ?? {}
  const row     = new Array(34).fill('')
  const a       = asset as any

  row[COL.YEAR]         = parsed?.year         ?? ''
  row[COL.MONTH]        = parsed?.month        ?? ''
  row[COL.CAT_CODE]     = parsed?.catCode      ?? ''
  row[COL.RUNNING]      = parsed?.running?.toString() ?? ''
  row[COL.ACCOUNT_CAT]  = a.account_category   ?? 'IT'
  row[COL.LOCATION]     = asset.location       ?? ''
  row[COL.STORED_AT]    = a.stored_at          ?? ''
  row[COL.ASSET_NO]     = asset.asset_no
  row[COL.NAME]         = asset.name
  row[COL.CPU]          = a.cpu                ?? ''
  row[COL.BRAND]        = asset.brand          ?? ''
  row[COL.SERIAL_NO]    = asset.serial_no      ?? ''
  row[COL.MAC_ETH]      = a.mac_ethernet       ?? ''
  row[COL.MAC_WIFI]     = a.mac_wifi           ?? ''
  row[COL.RAM]          = a.ram                ?? ''
  row[COL.STORAGE]      = a.storage_spec       ?? ''
  row[COL.RECEIVED_DATE]= asset.received_date  ?? ''
  row[COL.PRICE]        = asset.original_price?.toString() ?? ''
  row[COL.CATEGORY]     = asset.category       ?? ''
  row[COL.QUANTITY]     = (a.quantity ?? 1).toString()
  row[COL.NOTES]        = asset.notes          ?? ''
  row[COL.REPAIR_COUNT] = (a.repair_count ?? 0).toString()
  row[COL.STATUS]       = asset.status         ?? ''
  row[COL.USER_NAME]    = emp.full_name_th     ?? ''
  row[COL.EMP_ID]       = asset.emp_id         ?? ''
  row[COL.FULL_NAME_TH] = emp.full_name_th     ?? ''
  row[COL.FULL_NAME_EN] = emp.full_name_en     ?? ''
  row[COL.NICKNAME]     = emp.nickname         ?? ''
  row[COL.DEPARTMENT]   = emp.department ?? a.department ?? ''
  row[COL.POSITION]     = emp.position         ?? ''
  row[COL.BRANCH]       = emp.branch ?? a.branch ?? ''
  row[COL.EMAIL]        = emp.emp_email        ?? ''
  row[COL.PHONE]        = emp.phone            ?? ''

  return row
}

// ── Web → Sheets: upsert row by asset_no ─────────────────────────────────────

export async function syncAssetToSheet(asset: Asset & { employees?: any }) {
  if (!process.env.GOOGLE_SHEET_ID) return // ยังไม่ได้ config

  const sheets = await getSheetsClient()
  const range  = `${SHEET_NAME}!A:AH`

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })

  const rows     = (data.values ?? []) as string[][]
  // หา row ที่มี asset_no ตรงกัน (ข้ามแถว header ที่ index 0)
  const rowIndex = rows.findIndex(
    (r, i) => i > 0 && r[COL.ASSET_NO] === asset.asset_no
  )

  const rowData = assetToSheetRow(asset)

  if (rowIndex >= 0) {
    // อัพเดต row เดิม (sheets index = rowIndex + 1 เพราะ 1-based)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowData] },
    })
  } else {
    // เพิ่ม row ใหม่
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowData] },
    })
  }
}

// ── ดึงข้อมูลทั้งหมดจาก Sheets (ใช้สำหรับ manual full-sync) ─────────────────

export async function getAllSheetRows(): Promise<string[][]> {
  if (!process.env.GOOGLE_SHEET_ID) return []

  const sheets   = await getSheetsClient()
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:AH`,
  })

  const rows = (data.values ?? []) as string[][]
  return rows.slice(1) // ข้าม header
}
