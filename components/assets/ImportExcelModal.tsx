'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import { X, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  type: 'assets' | 'employees'
  userId: string
  onDone: () => void
  onClose: () => void
}

const ASSET_TEMPLATE = [{ asset_no: 'NTB-2024-001', name: 'MacBook Pro 14"', category: 'MacBook', brand: 'Apple', model: 'M3 Pro', serial_no: 'C02XG2JHQ05N', purchase_date: '2024-01-15', location: 'Office A', status: 'active', emp_id: 'EMP-001', notes: '' }]
const EMP_TEMPLATE = [
  { emp_id: 'EMP-001', full_name_th: 'สมชาย ใจดี', full_name_en: 'Somchai Jaidee', nickname: 'ชาย', department: 'IT', position: 'IT Support', branch: 'HQ', emp_email: 'somchai@company.com', phone: '081-234-5678', status: 'active' },
  { emp_id: '', full_name_th: '', full_name_en: '', nickname: '', department: '', position: '', branch: '', emp_email: '', phone: '', status: 'active / probation / resign' },
]

// แปลง Excel date serial → YYYY-MM-DD
function parseExcelDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  if (!s) return null
  // รองรับ dd/mm/yyyy และ yyyy-mm-dd
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
  return s
}

export default function ImportExcelModal({ type, userId, onDone, onClose }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importError, setImportError] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [skippedNos, setSkippedNos] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)

  const downloadTemplate = () => {
    const data = type === 'assets' ? ASSET_TEMPLATE : EMP_TEMPLATE
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type === 'assets' ? 'Assets' : 'Employees')
    XLSX.writeFile(wb, `template_${type}.xlsx`)
  }

  const parse = (file: File) => {
    setErrors([]); setImportError(''); setDone(false); setImportedCount(0); setSkippedCount(0); setSkippedNos([])
    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target!.result, { type: 'binary', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      setRows(data)
      const errs: string[] = []
      // required columns
      const req = type === 'assets' ? ['asset_no', 'name', 'category'] : ['emp_id', 'full_name_th']
      if (data.length) {
        req.forEach(k => {
          if (!Object.keys(data[0]).includes(k)) errs.push(`ไม่พบ column: ${k}`)
        })
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
      const VALID_CATEGORY = ['Notebook','MacBook','Desktop','iMac','Monitor','Printer','Network','Other']
      const VALID_STATUS = ['active','repair','storage','retired']

      // ดึง asset_no ที่มีอยู่แล้ว
      const allNos = rows.map(r => String(r.asset_no).trim()).filter(Boolean)
      const { data: existing } = await supabase
        .from('assets').select('asset_no').in('asset_no', allNos)
      const existingSet = new Set((existing ?? []).map(e => e.asset_no))

      const newRows = rows.filter(r => !existingSet.has(String(r.asset_no).trim()))
      const skipped = rows.filter(r => existingSet.has(String(r.asset_no).trim()))

      setSkippedCount(skipped.length)
      setSkippedNos(skipped.map(r => String(r.asset_no).trim()))

      if (!newRows.length) {
        setImporting(false); setDone(true); return
      }

      const records = newRows.map(r => ({
        asset_no: String(r.asset_no).trim(),
        name: String(r.name).trim(),
        category: VALID_CATEGORY.includes(String(r.category)) ? String(r.category) : 'Other',
        emp_id: r.emp_id ? String(r.emp_id).trim() : null,
        brand: r.brand ? String(r.brand).trim() : null,
        model: r.model ? String(r.model).trim() : null,
        serial_no: r.serial_no ? String(r.serial_no).trim() : null,
        purchase_date: parseExcelDate(r.purchase_date),
        location: r.location ? String(r.location).trim() : null,
        status: VALID_STATUS.includes(String(r.status).toLowerCase()) ? String(r.status).toLowerCase() : 'active',
        notes: r.notes ? String(r.notes).trim() : null,
        images: [],
        created_by: userId,
      }))

      const { data, error } = await supabase.from('assets').insert(records).select()
      if (error) {
        setImportError(`Import ล้มเหลว: ${error.message}`)
        setImporting(false); return
      }
      if (data?.length) {
        await supabase.from('asset_logs').insert(
          data.map(a => ({ asset_id: a.id, action: 'imported', detail: 'นำเข้าจาก Excel', performed_by: userId }))
        )
        setImportedCount(data.length)
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
      if (error) {
        setImportError(`Import ล้มเหลว: ${error.message}`)
        setImporting(false); return
      }
      if (empData?.length) {
        await supabase.from('employee_logs').insert(
          empData.map(e => ({ emp_id: e.emp_id, action: 'imported', detail: 'นำเข้าจาก Excel', performed_by: userId }))
        )
        setImportedCount(empData.length)
      }
    }

    setImporting(false); setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">
            Import Excel — {type === 'assets' ? 'Assets' : 'Employees'}
          </h3>
          <div className="flex items-center gap-3">
            <button onClick={downloadTemplate} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
              <Download size={13} /> Download Template
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Upload area */}
          {!done && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-8 cursor-pointer hover:border-indigo-400 transition-colors">
              <Upload size={28} className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-600 font-medium">คลิกเพื่อเลือกไฟล์</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx หรือ .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && parse(e.target.files[0])} />
            </label>
          )}

          {/* พบกี่ row */}
          {rows.length > 0 && !done && (
            <p className="text-sm text-gray-600 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-500" />
              พบ <span className="font-semibold">{rows.length}</span> รายการในไฟล์
            </p>
          )}

          {/* validation errors */}
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{e}</p>
            </div>
          ))}

          {/* import error */}
          {importError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{importError}</p>
            </div>
          )}

          {/* success */}
          {done && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-4">
                <CheckCircle2 size={24} className="text-green-500 shrink-0" />
                <div>
                  <p className="font-semibold text-green-700">Import เสร็จสิ้น!</p>
                  <p className="text-sm text-green-600">
                    เพิ่มใหม่ <span className="font-bold">{importedCount}</span> รายการ
                    {skippedCount > 0 && (
                      <span className="text-amber-600"> · ข้าม <span className="font-bold">{skippedCount}</span> รายการ (มีอยู่แล้ว)</span>
                    )}
                  </p>
                </div>
              </div>

              {skippedNos.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">
                    Asset No. ที่ข้ามเพราะมีอยู่แล้ว ({skippedNos.length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {skippedNos.map(no => (
                      <span key={no} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-mono">
                        {no}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={() => { done ? onDone() : onClose() }}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">
            {done ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!done && (
            <button onClick={doImport}
              disabled={!rows.length || !!errors.length || importing}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {importing ? 'กำลัง Import...' : `Import ${rows.length} รายการ`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
