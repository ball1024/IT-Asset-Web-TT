'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import { X, Upload, Download, CheckCircle2, AlertCircle, PlusCircle, RefreshCw } from 'lucide-react'
import { insertAssetLog, insertEmployeeLog } from '@/lib/logging'

interface Props {
  type: 'assets' | 'employees'
  userId: string
  onDone: () => void
  onClose: () => void
}

const ASSET_TEMPLATE = [{ asset_no: 'NTB-2024-001', name: 'MacBook Pro 14"', category: 'MacBook', brand: 'Apple', model: 'M3 Pro', serial_no: 'C02XG2JHQ05N', purchase_date: '2024-01-15', location: 'Office A', department: 'IT', status: 'active', emp_id: 'EMP-001', notes: '' }]
const EMP_TEMPLATE = [
  { emp_id: 'EMP-001', full_name_th: 'สมชาย ใจดี', full_name_en: 'Somchai Jaidee', nickname: 'ชาย', department: 'IT', position: 'IT Support', branch: 'HQ', emp_email: 'somchai@company.com', phone: '081-234-5678', status: 'active' },
  { emp_id: '', full_name_th: '', full_name_en: '', nickname: '', department: '', position: '', branch: '', emp_email: '', phone: '', status: 'active / probation / resign' },
]

function parseExcelDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  if (!s) return null
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
  return s
}

export default function ImportExcelModal({ type, userId, onDone, onClose }: Props) {
  const [importMode, setImportMode] = useState<'add' | 'update'>('add')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importError, setImportError] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const [updatedCount, setUpdatedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [skippedNos, setSkippedNos] = useState<string[]>([])
  const [invalidEmpIds, setInvalidEmpIds] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  const downloadTemplate = () => {
    const data = type === 'assets' ? ASSET_TEMPLATE : EMP_TEMPLATE
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type === 'assets' ? 'Assets' : 'Employees')
    XLSX.writeFile(wb, `template_${type}.xlsx`)
  }

  const reset = () => {
    setRows([]); setErrors([]); setImportError(''); setDone(false)
    setImportedCount(0); setUpdatedCount(0); setSkippedCount(0); setSkippedNos([]); setInvalidEmpIds([])
  }

  const parse = (file: File) => {
    reset()
    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target!.result, { type: 'binary', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      setRows(data)
      const errs: string[] = []
      const req = type === 'assets'
        ? (importMode === 'update' ? ['asset_no'] : ['asset_no', 'name', 'category'])
        : ['emp_id', 'full_name_th']
      if (data.length) {
        req.forEach(k => {
          if (!Object.keys(data[0]).includes(k)) errs.push(`ไม่พบ column: ${k}`)
        })
      }
      if (!data.length) errs.push('ไม่พบข้อมูลในไฟล์')
      if (importMode === 'update' && type === 'assets' && data.length && !Object.keys(data[0]).includes('asset_no')) {
        setAlertMsg('ไม่พบ column "asset_no" ในไฟล์\n\nUpdate mode ต้องใช้ Asset No. เพื่อระบุว่าจะอัปเดต Asset ไหน กรุณาตรวจสอบไฟล์และลองใหม่')
      }
      setErrors(errs)
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    if (errors.length || !rows.length) return
    setImporting(true); setImportError('')

    const supabase = createClient()

    if (type === 'assets') {
      const VALID_CATEGORY = ['Notebook','MacBook','PC Desktop','iMac','Android','iOS','iPad','Monitor','Printer','TV','Network','Other']
      const VALID_STATUS = ['active','available','repair','storage']

      const allNos = rows.map(r => String(r.asset_no).trim()).filter(Boolean)

      // validate emp_id
      const allEmpIds = rows.map(r => r.emp_id ? String(r.emp_id).trim() : null).filter(Boolean) as string[]
      const validEmpSet = new Set<string>()
      if (allEmpIds.length) {
        const { data: empData } = await supabase.from('employees').select('emp_id').in('emp_id', allEmpIds)
        ;(empData ?? []).forEach(e => validEmpSet.add(e.emp_id))
      }
      const invalidEmps = allEmpIds.filter(id => !validEmpSet.has(id))
      if (invalidEmps.length) setInvalidEmpIds([...new Set(invalidEmps)])

      if (importMode === 'update') {
        // UPDATE mode: อัปเดตเฉพาะ asset ที่มีอยู่แล้ว
        const { data: existing } = await supabase.from('assets').select('id, asset_no').in('asset_no', allNos)
        const existingMap = Object.fromEntries((existing ?? []).map(e => [e.asset_no, e.id]))

        const notFound = allNos.filter(no => !existingMap[no])
        setSkippedCount(notFound.length)
        setSkippedNos(notFound)

        const updateRows = rows.filter(r => existingMap[String(r.asset_no).trim()])
        if (!updateRows.length) { setImporting(false); setDone(true); return }

        let count = 0
        for (const r of updateRows) {
          const assetId = existingMap[String(r.asset_no).trim()]
          const empId = r.emp_id && validEmpSet.has(String(r.emp_id).trim()) ? String(r.emp_id).trim() : undefined
          const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (r.name) payload.name = String(r.name).trim()
          if (r.category) payload.category = VALID_CATEGORY.includes(String(r.category)) ? String(r.category) : 'Other'
          if (r.brand !== undefined) payload.brand = r.brand ? String(r.brand).trim() : null
          if (r.model !== undefined) payload.model = r.model ? String(r.model).trim() : null
          if (r.serial_no !== undefined) payload.serial_no = r.serial_no ? String(r.serial_no).trim() : null
          if (r.purchase_date !== undefined) payload.purchase_date = parseExcelDate(r.purchase_date)
          if (r.location !== undefined) payload.location = r.location ? String(r.location).trim() : null
          if (r.department !== undefined) payload.department = r.department ? String(r.department).trim() : null
          if (r.notes !== undefined) payload.notes = r.notes ? String(r.notes).trim() : null
          if (empId !== undefined) {
            payload.emp_id = empId
            payload.department = (r.department ? String(r.department).trim() : null) ?? payload.department
          } else if (r.emp_id === '') {
            payload.emp_id = null
          }
          if (r.status) {
            payload.status = !payload.emp_id
              ? 'available'
              : VALID_STATUS.includes(String(r.status).toLowerCase()) ? String(r.status).toLowerCase() : 'active'
          }

          const { error } = await supabase.from('assets').update(payload).eq('id', assetId)
          if (!error) {
            await insertAssetLog({ asset_id: assetId, action: 'updated', detail: 'อัปเดตจาก Excel Import', performed_by: userId })
            count++
          }
        }
        setUpdatedCount(count)

      } else {
        // ADD mode: เพิ่มเฉพาะที่ไม่มีอยู่แล้ว
        const { data: existing } = await supabase.from('assets').select('asset_no').in('asset_no', allNos)
        const existingSet = new Set((existing ?? []).map(e => e.asset_no))

        const newRows = rows.filter(r => !existingSet.has(String(r.asset_no).trim()))
        const skipped = rows.filter(r => existingSet.has(String(r.asset_no).trim()))
        setSkippedCount(skipped.length)
        setSkippedNos(skipped.map(r => String(r.asset_no).trim()))

        if (!newRows.length) { setImporting(false); setDone(true); return }

        const records = newRows.map(r => ({
          asset_no: String(r.asset_no).trim(),
          name: String(r.name).trim(),
          category: VALID_CATEGORY.includes(String(r.category)) ? String(r.category) : 'Other',
          emp_id: r.emp_id && validEmpSet.has(String(r.emp_id).trim()) ? String(r.emp_id).trim() : null,
          brand: r.brand ? String(r.brand).trim() : null,
          model: r.model ? String(r.model).trim() : null,
          serial_no: r.serial_no ? String(r.serial_no).trim() : null,
          purchase_date: parseExcelDate(r.purchase_date),
          location: r.location ? String(r.location).trim() : null,
          department: r.department ? String(r.department).trim() : null,
          status: !(r.emp_id && validEmpSet.has(String(r.emp_id).trim()))
            ? 'available'
            : VALID_STATUS.includes(String(r.status).toLowerCase()) ? String(r.status).toLowerCase() : 'active',
          notes: r.notes ? String(r.notes).trim() : null,
          images: [],
          created_by: userId,
        }))

        const { data, error } = await supabase.from('assets').insert(records).select()
        if (error) { setImportError(`Import ล้มเหลว: ${error.message}`); setImporting(false); return }
        if (data?.length) {
          for (const a of data)
            await insertAssetLog({ asset_id: a.id, action: 'imported', detail: 'นำเข้าจาก Excel', performed_by: userId })
          setImportedCount(data.length)
        }
      }

    } else {
      const VALID_STATUS = ['active', 'probation', 'resign']
      const records = rows
        .filter(r => String(r.emp_id).trim() && String(r.full_name_th).trim())
        .map(r => ({
          emp_id: String(r.emp_id).trim(),
          full_name_th: String(r.full_name_th).trim(),
          full_name_en: r.full_name_en ? String(r.full_name_en).trim() : null,
          nickname: r.nickname ? String(r.nickname).trim() : null,
          department: r.department ? String(r.department).trim() : null,
          position: r.position ? String(r.position).trim() : null,
          branch: r.branch ? String(r.branch).trim() : null,
          emp_email: r.emp_email ? String(r.emp_email).trim() : null,
          phone: r.phone ? String(r.phone).trim() : null,
          status: VALID_STATUS.includes(String(r.status).toLowerCase()) ? String(r.status).toLowerCase() : 'active',
        }))

      const { data: empData, error } = await supabase
        .from('employees').upsert(records, { onConflict: 'emp_id' }).select()
      if (error) { setImportError(`Import ล้มเหลว: ${error.message}`); setImporting(false); return }
      if (empData?.length) {
        for (const e of empData)
          await insertEmployeeLog({ emp_id: e.emp_id, action: 'imported', detail: 'นำเข้าจาก Excel', performed_by: userId })
        setImportedCount(empData.length)
      }
    }

    setImporting(false); setDone(true)
  }

  if (alertMsg) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">ไม่พบ Asset No.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">ไฟล์ไม่ถูกต้องสำหรับ Update mode</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 whitespace-pre-line">{alertMsg}</p>
        <button onClick={() => setAlertMsg('')}
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          ตกลง
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">
            Import Excel — {type === 'assets' ? 'Assets' : 'Employees'}
          </h3>
          <div className="flex items-center gap-3">
            <button onClick={downloadTemplate} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              <Download size={13} /> Download Template
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector — เฉพาะ assets */}
          {type === 'assets' && !done && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setImportMode('add'); reset() }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${importMode === 'add' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <PlusCircle size={15} /> เพิ่มใหม่
              </button>
              <button onClick={() => { setImportMode('update'); reset() }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${importMode === 'update' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <RefreshCw size={15} /> อัปเดตข้อมูล
              </button>
            </div>
          )}

          {/* Mode description */}
          {type === 'assets' && !done && (
            <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
              {importMode === 'add'
                ? '📥 เพิ่ม Asset ใหม่เท่านั้น — Asset No. ที่มีอยู่แล้วจะถูกข้าม'
                : '🔄 อัปเดตข้อมูล Asset ที่มีอยู่แล้วตาม Asset No. — ไม่เพิ่ม Asset ใหม่'}
            </p>
          )}

          {/* Upload area */}
          {!done && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-8 cursor-pointer hover:border-indigo-400 transition-colors">
              <Upload size={28} className="text-gray-400 dark:text-gray-500 mb-2" />
              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">คลิกเพื่อเลือกไฟล์</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">.xlsx หรือ .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && parse(e.target.files[0])} />
            </label>
          )}

          {rows.length > 0 && !done && (
            <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-500" />
              พบ <span className="font-semibold">{rows.length}</span> รายการในไฟล์
            </p>
          )}

          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{e}</p>
            </div>
          ))}

          {importError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
            </div>
          )}

          {done && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-4 py-4">
                <CheckCircle2 size={24} className="text-green-500 shrink-0" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">Import เสร็จสิ้น!</p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {importMode === 'update'
                      ? <>อัปเดต <span className="font-bold">{updatedCount}</span> รายการ</>
                      : <>เพิ่มใหม่ <span className="font-bold">{importedCount}</span> รายการ</>
                    }
                    {skippedCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}· {importMode === 'update' ? 'ไม่พบ' : 'ข้าม'} <span className="font-bold">{skippedCount}</span> รายการ
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {skippedNos.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                    {importMode === 'update' ? 'Asset No. ที่ไม่พบในระบบ' : 'Asset No. ที่ข้ามเพราะมีอยู่แล้ว'} ({skippedNos.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {skippedNos.map(no => (
                      <span key={no} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs rounded font-mono">{no}</span>
                    ))}
                  </div>
                </div>
              )}
              {invalidEmpIds.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1.5">
                    รหัสพนักงานที่ไม่พบในระบบ — ถูกเคลียร์ออก ({invalidEmpIds.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {invalidEmpIds.map(id => (
                      <span key={id} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 text-xs rounded font-mono">{id}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={() => { done ? onDone() : onClose() }}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            {done ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!done && (
            <button onClick={doImport}
              disabled={!rows.length || !!errors.length || importing}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {importing ? 'กำลัง Import...' : `${importMode === 'update' ? 'อัปเดต' : 'Import'} ${rows.length} รายการ`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
