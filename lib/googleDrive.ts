import { google } from 'googleapis'
import { Readable } from 'stream'

function getDriveAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  return new google.auth.JWT({
    email:  process.env.GOOGLE_CLIENT_EMAIL,
    key:    privateKey,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  })
}

export async function getDriveClient() {
  const auth = getDriveAuth()
  await auth.authorize()
  return google.drive({ version: 'v3', auth })
}

/**
 * หา folder id ที่มีชื่อ folderName ภายใต้ parent
 * ถ้ายังไม่มีให้สร้างใหม่
 */
async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, folderName: string, parentId?: string) {
  const q = [
    `name = '${folderName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : '',
  ].filter(Boolean).join(' and ')

  const { data } = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 })
  if (data.files?.length) return data.files[0].id!

  const { data: created } = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  })
  return created.id!
}

/**
 * upload รูปไปยัง Google Drive
 * จัดเก็บใน GOOGLE_DRIVE_BACKUP_FOLDER_ID/assetNo/filename
 */
export async function backupImageToDrive(
  imageBuffer: Buffer,
  filename: string,
  assetNo: string,
  mimeType = 'image/webp',
) {
  if (!process.env.GOOGLE_CLIENT_EMAIL) return null

  const drive      = await getDriveClient()
  const rootFolder = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID // optional

  // สร้าง/หา subfolder ชื่อ asset_no
  const assetFolder = await getOrCreateFolder(drive, assetNo, rootFolder ?? undefined)

  const { data } = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: [assetFolder],
    },
    media: {
      mimeType,
      body: Readable.from(imageBuffer),
    },
    fields: 'id, name, webViewLink',
  })

  return data
}
