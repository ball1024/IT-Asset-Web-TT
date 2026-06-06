'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { AssetLicense } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import { Plus, X, AlertTriangle, Upload, Download, Lock, Copy, Check, KeyRound, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function LicenseSection({ assetId, role, userId, onLogChange }: { assetId: string; role: string | null; userId: string | null; onLogChange?: () => void }) {
  const [licenses, setLicenses] = useState<AssetLicense[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', license_key: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [myRequests, setMyRequests] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>({})
  const [confirmDelete, setConfirmDelete] = useState<AssetLicense | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState<'add' | 'update'>('add')
  const [importRows, setImportRows] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({})
  const [remaining, setRemaining] = useState<Record<string, number>>({})

  const OPEN_DURATION = 10 * 60 * 1000
  const APPROVAL_TTL  = 4 * 60 * 60 * 1000

  const canManage = role === 'admin' || role === 'master_admin'
  const canReveal = role === 'admin' || role === 'master_admin'
  const canRequest = role === 'user'

  const load = async () => {
    const { data } = await createClient().from('asset_licenses').select('*').eq('asset_id', assetId).order('created_at')
    setLicenses(data ?? [])
    setLoading(false)
  }

  const loadMyRequests = async () => {
    if (!userId || !canRequest) return
    const { data } = await createClient()
      .from('license_view_requests')
      .select('license_id, status, approved_at')
      .eq('requested_by', userId)
    const map: Record<string, 'pending' | 'approved' | 'rejected'> = {}
    const expiredIds: string[] = []
    ;(data ?? []).forEach((r: any) => {
      if (r.status === 'approved' && r.approved_at) {
        const age = Date.now() - new Date(r.approved_at).getTime()
        if (age > APPROVAL_TTL) {
          expiredIds.push(r.license_id)
          return
        }
      }
      map[r.license_id] = r.status
    })
    if (expiredIds.length) {
      await createClient()
        .from('license_view_requests')
        .delete()
        .in('license_id', expiredIds)
        .eq('requested_by', userId)
    }
    setMyRequests(map)
  }

  useEffect(() => {
    if (!canRequest) return
    const stored: Record<string, number> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('lic_open_')) {
        const ts = parseInt(localStorage.getItem(k) ?? '0')
        const id = k.replace('lic_open_', '')
        if (Date.now() - ts < OPEN_DURATION) stored[id] = ts
        else localStorage.removeItem(k)
      }
    }
    if (Object.keys(stored).length) setOpenedAt(stored)
  }, [canRequest])

  useEffect(() => {
    if (!Object.keys(openedAt).length) return
    const timer = setInterval(() => {
      const now = Date.now()
      const newRemaining: Record<string, number> = {}
      const newOpened = { ...openedAt }
      let changed = false
      const expiredLicenseIds: string[] = []
      for (const [id, ts] of Object.entries(openedAt)) {
        const left = OPEN_DURATION - (now - ts)
        if (left <= 0) {
          delete newOpened[id]
          localStorage.removeItem(`lic_open_${id}`)
          expiredLicenseIds.push(id)
          changed = true
        } else {
          newRemaining[id] = Math.ceil(left / 1000)
        }
      }
      if (expiredLicenseIds.length && userId) {
        createClient()
          .from('license_view_requests')
          .delete()
          .in('license_id', expiredLicenseIds)
          .eq('requested_by', userId)
          .then(() => {
            setMyRequests(m => {
              const next = { ...m }
              expiredLicenseIds.forEach(id => delete next[id])
              return next
            })
          })
      }
      setRemaining(newRemaining)
      if (changed) setOpenedAt(newOpened)
    }, 1000)
    return () => clearInterval(timer)
  }, [openedAt])

  const openKey = (licenseId: string) => {
    const ts = Date.now()
    localStorage.setItem(`lic_open_${licenseId}`, String(ts))
    setOpenedAt(m => ({ ...m, [licenseId]: ts }))
    setRemaining(m => ({ ...m, [licenseId]: OPEN_DURATION / 1000 }))
  }

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  useEffect(() => { load(); loadMyRequests() }, [assetId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`asset-licenses-${assetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_licenses' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { asset_id?: string }
          if (row?.asset_id === assetId) load()
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [assetId])

  useEffect(() => {
    if (!userId || !canRequest) return
    const supabase = createClient()
    const channel = supabase
      .channel(`license-requests-${assetId}-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'license_view_requests' },
        (payload) => {
          const row = payload.new as { requested_by?: string }
          if (row?.requested_by === userId) loadMyRequests()
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'license_view_requests' },
        () => loadMyRequests())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, canRequest, assetId])

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()
    if (editId) {
      const old = licenses.find(l => l.id === editId)
      await supabase.from('asset_licenses').update({ name: form.name, license_key: form.license_key || null, notes: form.notes || null }).eq('id', editId)
      const changes: string[] = []
      if (old?.name !== form.name) changes.push(`ชื่อ: ${old?.name ?? '(ว่าง)'} → ${form.name}`)
      if ((old?.notes ?? '') !== form.notes) changes.push(`หมายเหตุ: ${old?.notes ?? '(ว่าง)'} → ${form.notes || '(ว่าง)'}`)
      const oldKey = old?.license_key ?? ''
      const newKey = form.license_key
      if (oldKey !== newKey) {
        if (!oldKey && newKey) changes.push('เพิ่ม License Key')
        else if (oldKey && !newKey) changes.push('ลบ License Key')
        else changes.push('แก้ไข License Key')
      }
      const detail = [`แก้ไขโปรแกรม: ${form.name}`, ...changes].join('\n')
      await insertAssetLog({ asset_id: assetId, action: 'license_updated', performed_by: userId ?? undefined, detail })
      onLogChange?.()
      setEditId(null)
    } else {
      await supabase.from('asset_licenses').insert({ asset_id: assetId, name: form.name, license_key: form.license_key || null, notes: form.notes || null, created_by: userId })
      const addLines = [`เพิ่มโปรแกรม: ${form.name}`]
      if (form.license_key) addLines.push('มี License Key')
      if (form.notes) addLines.push(`หมายเหตุ: ${form.notes}`)
      await insertAssetLog({ asset_id: assetId, action: 'license_added', performed_by: userId ?? undefined, detail: addLines.join('\n') })
      onLogChange?.()
      setAdding(false)
    }
    setForm({ name: '', license_key: '', notes: '' })
    setSaving(false)
    load()
  }

  const remove = async (id: string) => {
    const lic = licenses.find(l => l.id === id)
    await createClient().from('asset_licenses').delete().eq('id', id)
    if (lic) await insertAssetLog({ asset_id: assetId, action: 'license_removed', performed_by: userId ?? undefined, detail: `ลบโปรแกรม: ${lic.name}` })
    onLogChange?.()
    setConfirmDelete(null)
    load()
  }

  const startEdit = (lic: AssetLicense) => {
    setEditId(lic.id)
    setAdding(false)
    setForm({ name: lic.name, license_key: lic.license_key ?? '', notes: lic.notes ?? '' })
  }

  const sendRequest = async (licenseId: string) => {
    if (!userId) return
    await createClient().from('license_view_requests').upsert(
      { license_id: licenseId, requested_by: userId, status: 'pending' },
      { onConflict: 'license_id,requested_by' }
    )
    setMyRequests(m => ({ ...m, [licenseId]: 'pending' }))
  }

  const copy = (id: string, key: string) => {
    navigator.clipboard.writeText(key)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ name: 'Microsoft Word', license_key: 'XXXXX-XXXXX-XXXXX', notes: '' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Licenses')
    XLSX.writeFile(wb, 'licenses_template.xlsx')
  }

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setImportRows(XLSX.utils.sheet_to_json(ws) as any[])
    }
    reader.readAsBinaryString(file)
  }

  const runImport = async () => {
    if (!importRows.length) return
    setImporting(true)
    const nameMap = Object.fromEntries(licenses.map(l => [l.name.trim().toLowerCase(), l.id]))
    let added = 0, updated = 0, skipped = 0
    for (const row of importRows) {
      const name = String(row.name ?? '').trim()
      if (!name) { skipped++; continue }
      const payload = { name, license_key: row.license_key ? String(row.license_key) : null, notes: row.notes ? String(row.notes) : null }
      const existId = nameMap[name.toLowerCase()]
      if (existId) {
        if (importMode === 'update') {
          await createClient().from('asset_licenses').update(payload).eq('id', existId)
          updated++
        } else { skipped++ }
      } else {
        await createClient().from('asset_licenses').insert({ ...payload, asset_id: assetId, created_by: userId })
        added++
      }
    }
    setImportResult({ added, updated, skipped })
    setImporting(false)
    load()
  }

  const inp = 'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400'

  if (loading) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setConfirmDelete(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">ลบ License</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">ไม่สามารถกู้คืนได้</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">ลบ <span className="font-semibold">{confirmDelete.name}</span> ออกจาก Asset นี้ใช่ไหม?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                ยกเลิก
              </button>
              <button onClick={() => remove(confirmDelete.id)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium">
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Upload size={15} /> Import Programs</h3>
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <button onClick={downloadTemplate} className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                <Download size={14} /> ดาวน์โหลด Template
              </button>
              <div className="grid grid-cols-2 gap-2">
                {([['add', 'เพิ่มใหม่', 'ชื่อซ้ำจะข้าม'], ['update', 'เพิ่ม + อัปเดต', 'ชื่อซ้ำจะอัปเดต']] as const).map(([k, t, d]) => (
                  <button key={k} onClick={() => setImportMode(k)}
                    className={`text-left p-2.5 rounded-xl border-2 transition-colors ${importMode === k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
                    <p className={`text-xs font-medium ${importMode === k ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200'}`}>{t}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} />
              <button onClick={() => importRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors">
                <Upload size={14} /> {importRows.length ? `เลือกแล้ว · ${importRows.length} แถว` : 'เลือกไฟล์ .xlsx / .csv'}
              </button>
              {importResult && (() => {
                const hasSuccess = importResult.added > 0 || importResult.updated > 0
                return (
                  <div className={`p-3 rounded-xl text-xs space-y-1.5 ${hasSuccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <p className={`font-medium ${hasSuccess ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {hasSuccess ? 'Import สำเร็จ' : 'ไม่มีรายการถูก Import'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {importResult.added > 0 && (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
                          ✓ เพิ่มใหม่ {importResult.added}
                        </span>
                      )}
                      {importResult.updated > 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                          ↻ อัปเดต {importResult.updated}
                        </span>
                      )}
                      {importResult.skipped > 0 && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                          – ข้าม {importResult.skipped}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2 justify-end px-5 pb-4">
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportResult(null) }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                {importResult ? 'ปิด' : 'ยกเลิก'}
              </button>
              {!importResult && (
                <button onClick={runImport} disabled={!importRows.length || importing}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {importing ? 'กำลัง Import...' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <KeyRound size={13} /> Programs & Licenses
        </p>
        {canManage && !adding && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowImport(true); setImportResult(null) }}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 transition-colors">
              <Upload size={12} /> Import
            </button>
            <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: '', license_key: '', notes: '' }) }}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              <Plus size={13} /> เพิ่ม
            </button>
          </div>
        )}
      </div>

      {(adding || editId) && canManage && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อโปรแกรม เช่น Microsoft Word *" className={inp} />
          <input value={form.license_key} onChange={e => setForm(f => ({ ...f, license_key: e.target.value }))}
            placeholder="License Key (ถ้ามี)" className={inp} />
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="หมายเหตุ (ถ้ามี)" className={inp} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setEditId(null) }}
              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              ยกเลิก
            </button>
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {licenses.length === 0 && !adding ? (
        <div className="text-center py-6">
          <KeyRound size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-400 dark:text-gray-500">ยังไม่มีโปรแกรมหรือ License</p>
        </div>
      ) : (
        <div className="space-y-2">
          {licenses.map(lic => {
            const isRevealed = revealed.has(lic.id)
            return (
              <div key={lic.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {lic.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{lic.name}</p>

                  {lic.license_key && (
                    <div className="mt-1 flex items-center gap-1.5">
                      {canReveal ? (
                        <>
                          <code className={`text-xs font-mono text-gray-600 dark:text-gray-300 ${!isRevealed ? 'blur-sm select-none' : ''} transition-all`}>
                            {lic.license_key}
                          </code>
                          <button onClick={() => setRevealed(s => { const n = new Set(s); isRevealed ? n.delete(lic.id) : n.add(lic.id); return n })}
                            className="text-gray-400 hover:text-indigo-500 shrink-0">
                            <Lock size={11} />
                          </button>
                          {isRevealed && (
                            <button onClick={() => copy(lic.id, lic.license_key!)}
                              className="text-gray-400 hover:text-indigo-500 shrink-0">
                              {copied === lic.id ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                            </button>
                          )}
                        </>
                      ) : canRequest ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const status = myRequests[lic.id]
                            const isOpen = !!openedAt[lic.id]
                            const secs = remaining[lic.id] ?? 0

                            if (status === 'approved' && isOpen) {
                              return (
                                <>
                                  <code className="text-xs font-mono text-gray-700 dark:text-gray-200 break-all">
                                    {lic.license_key}
                                  </code>
                                  <button onClick={() => copy(lic.id, lic.license_key!)}
                                    className="text-gray-400 hover:text-indigo-500 shrink-0">
                                    {copied === lic.id ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                                  </button>
                                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${secs <= 60 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                    ⏱ {formatCountdown(secs)}
                                  </span>
                                </>
                              )
                            }

                            if (status === 'approved' && !isOpen) {
                              return (
                                <>
                                  <code className="text-xs font-mono text-gray-300 dark:text-gray-600 blur-sm select-none">
                                    {lic.license_key}
                                  </code>
                                  <button onClick={() => openKey(lic.id)}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shrink-0">
                                    <Lock size={10} /> เปิดดู (10 นาที)
                                  </button>
                                </>
                              )
                            }

                            if (status === 'rejected') {
                              return (
                                <span className="text-xs text-red-400 flex items-center gap-1">
                                  <Lock size={10} /> คำขอถูกปฏิเสธ
                                </span>
                              )
                            }

                            return (
                              <>
                                <code className="text-xs font-mono text-gray-300 dark:text-gray-600 blur-sm select-none">
                                  {lic.license_key}
                                </code>
                                <button
                                  onClick={() => sendRequest(lic.id)}
                                  disabled={status === 'pending'}
                                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors shrink-0 ${status === 'pending' ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100'}`}>
                                  <Lock size={10} />
                                  {status === 'pending' ? 'รอการอนุมัติ' : 'ขอดู'}
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600">
                          <Lock size={10} /> <span>ไม่มีสิทธิ์ดู</span>
                        </div>
                      )}
                    </div>
                  )}

                  {lic.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{lic.notes}</p>}
                </div>

                {canManage && editId !== lic.id && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(lic)} className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => setConfirmDelete(lic)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X size={13} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
