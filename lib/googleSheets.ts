import { google } from 'googleapis'

function getAuth() {
  const raw = process.env.GOOGLE_PRIVATE_KEY ?? ''
  // รองรับทั้ง \n จริง และ literal \\n ที่ได้จาก .env
  const privateKey = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw

  return new google.auth.JWT({
    email:  process.env.GOOGLE_CLIENT_EMAIL,
    key:    privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function getSheetsClient() {
  const auth = getAuth()
  await auth.authorize()
  return google.sheets({ version: 'v4', auth })
}

export const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID!
export const SHEET_NAME = process.env.GOOGLE_SHEET_NAME ?? 'Sheet1'

// Column indices (0-based) ตาม header ใน Google Sheet
export const COL = {
  NO: 0,            // A  — NO.
  YEAR: 1,          // B  — ปี
  MONTH: 2,         // C  — เดือน
  CAT_CODE: 3,      // D  — ประเภททรัพย์สิน (01–10)
  RUNNING: 4,       // E  — Running number
  ACCOUNT_CAT: 5,   // F  — หมวดบัญชี (IT/FA)
  LOCATION: 6,      // G  — สถานที่
  STORED_AT: 7,     // H  — เก็บไว้ที่
  ASSET_NO: 8,      // I  — Asset-Running (key)
  NAME: 9,          // J  — ชื่ออุปกรณ์
  CPU: 10,          // K  — CPU
  BRAND: 11,        // L  — Brand
  SERIAL_NO: 12,    // M  — Serial Number
  MAC_ETH: 13,      // N  — Mac Address Ethernet
  MAC_WIFI: 14,     // O  — Mac Address Wifi
  RAM: 15,          // P  — Ram
  STORAGE: 16,      // Q  — Storage
  RECEIVED_DATE: 17,// R  — วันที่รับเข้า
  PRICE: 18,        // S  — มูลค่าที่ซื้อมา
  CATEGORY: 19,     // T  — ประเภทอุปกรณ์ (ชื่อ)
  QUANTITY: 20,     // U  — จำนวน
  NOTES: 21,        // V  — หมายเหตุ
  REPAIR_COUNT: 22, // W  — ประวัติการซ่อม กี่ครั้ง
  STATUS: 23,       // X  — Status
  USER_NAME: 24,    // Y  — ชื่อผู้ใช้งาน
  EMP_ID: 25,       // Z  — รหัสพนักงาน
  FULL_NAME_TH: 26, // AA — Full Name (TH)
  FULL_NAME_EN: 27, // AB — Full Name (EN)
  NICKNAME: 28,     // AC — Nickname
  DEPARTMENT: 29,   // AD — Department
  POSITION: 30,     // AE — Position
  BRANCH: 31,       // AF — Branch
  EMAIL: 32,        // AG — Email
  PHONE: 33,        // AH — Phone
} as const

// Category code ↔ ชื่อ
export const CATEGORY_CODE_MAP: Record<string, string> = {
  '01': 'Notebook',
  '02': 'MacBook',
  '03': 'PC Desktop',
  '04': 'iMac',
  '05': 'Android',
  '06': 'iOS',
  '07': 'iPad',
  '08': 'Monitor',
  '09': 'Printer',
  '10': 'TV',
  '11': 'Network',
  '12': 'Other',
}

export const CATEGORY_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_CODE_MAP).map(([k, v]) => [v.toLowerCase(), k])
)

/** แยก asset_no IT-6905-01-0001 → { prefix, year, month, catCode, running } */
export function parseAssetNo(assetNo: string) {
  const parts = assetNo.split('-')
  if (parts.length !== 4) return null
  const [prefix, yearMonth, catCode, runningStr] = parts
  if (yearMonth.length !== 4) return null
  return {
    prefix,
    year: yearMonth.slice(0, 2),   // '69'
    month: yearMonth.slice(2, 4),  // '05'
    catCode,                        // '01'
    running: parseInt(runningStr, 10),
  }
}
