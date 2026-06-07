'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import type { Asset, RepairRequest, RepairResolution } from '@/lib/supabase'
import { assignSpare, resolveRepair, confirmNewAssetReceived } from '@/services/repairService'
import { X, Wrench, Loader2, Package, Search, CheckCircle2, ChevronRight, ArrowLeft, Clock, Plus } from 'lucide-react'

interface Props {
  repair: RepairRequest
  userId?: string
  onDone: () => void
  onClose: () => void
}

const CATEGORIES = ['ทั้งหมด', 'Notebook', 'MacBook', 'PC Desktop', 'iMac', 'Android', 'iOS', 'iPad', 'Monitor', 'Printer', 'TV', 'Network', 'Other']

type Step = 'accept' | 'result' | 'link_new_asset'

function StepBar({ current, showThree }: { current: Step; showThree?: boolean }) {
  const steps = showThree
    ? [{ key: 'accept', label: 'รับเรื่อง' }, { key: 'result', label: 'ผลลัพธ์' }, { key: 'link_new_asset', label: 'เครื่องใหม่' }]
    : [{ key: 'accept', label: 'รับเรื่อง' }, { key: 'result', label: 'ผลลัพธ์' }]
  const idx = steps.findIndex(s => s.key === current)
  return (
    <div className="flex items-center gap-0 mb-5">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
              ${i < idx ? 'bg-indigo-600 border-indigo-600 text-white'
                : i === idx ? 'bg-white dark:bg-gray-800 border-indigo-600 text-indigo-600'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'}`}>
              {i < idx ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <p className={`text-xs mt-1 ${i === idx ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-400'}`}>{s.label}</p>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-full mb-4 ${i < idx ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function ResolveRepairModal({ repair, userId, onDone, onClose }: Props) {
  const router = useRouter()

  const initialStep: Step = repair.resolution === 'waiting_new' ? 'link_new_asset'
    : repair.status === 'in_progress' ? 'result' : 'accept'
  const [step, setStep] = useState<Step>(initialStep)

  // spare
  const [hasSpare, setHasSpare] = useState(false)
  const [spareCategory, setSpareCategory] = useState('ทั้งหมด')
  const [spareQuery, setSpareQuery] = useState('')
  const [allSpares, setAllSpares] = useState<Asset[]>([])
  const [selectedSpare, setSelectedSpare] = useState<Asset | null>(null)
  const [currentSpare, setCurrentSpare] = useState<Asset | null>(null)
  const [acceptNotes, setAcceptNotes] = useState('')

  // result
  const [resultChoice, setResultChoice] = useState<'old' | 'new' | 'waiting' | null>(null)
  const [resultNotes, setResultNotes] = useState(repair.notes ?? '')
  const [saving, setSaving] = useState(false)

  // link_new_asset
  const [newAssetQuery, setNewAssetQuery] = useState('')
  const [newAssetCategory, setNewAssetCategory] = useState('ทั้งหมด')
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([])
  const [selectedNewAsset, setSelectedNewAsset] = useState<Asset | null>(null)
  // true = มาจาก "ได้เครื่องใหม่" ทันที, false = มาจาก "รอเครื่องใหม่" ก่อนหน้า
  const [isImmediateReplace, setIsImmediateReplace] = useState(false)

  const assetInfo = repair.assets as any
  const showThreeSteps = step === 'link_new_asset' && isImmediateReplace

  useEffect(() => {
    if (step === 'link_new_asset') {
      const supabase = createClient()
      supabase.from('assets').select('id,asset_no,name,category,brand,model')
        .eq('status', 'available').order('category')
        .then(({ data }) => setAvailableAssets((data ?? []) as Asset[]))
    }
  }, [step])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('assets').select('id,asset_no,name,category')
      .eq('status', 'spare').is('emp_id', null).order('category')
      .then(({ data }) => setAllSpares((data ?? []) as Asset[]))

    if (repair.spare_asset_id) {
      supabase.from('assets').select('id,asset_no,name,category').eq('id', repair.spare_asset_id).single()
        .then(({ data }) => { if (data) setCurrentSpare(data as Asset) })
    }
  }, [repair.spare_asset_id])

  const filteredSpares = allSpares.filter(s => {
    const matchCat = spareCategory === 'ทั้งหมด' || s.category === spareCategory
    const matchQ = !spareQuery.trim() ||
      s.asset_no.toLowerCase().includes(spareQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(spareQuery.toLowerCase())
    return matchCat && matchQ
  })

  // Step 1: รับเรื่อง → in_progress
  const handleAccept = async () => {
    setSaving(true)
    const supabase = createClient()
    if (hasSpare && selectedSpare) {
      const { data: assetData } = await supabase.from('assets').select('emp_id').eq('id', repair.asset_id).single()
      await assignSpare({
        repairId: repair.id, assetId: repair.asset_id,
        spareAssetId: selectedSpare.id, empId: assetData?.emp_id ?? undefined,
        performed_by: userId,
      })
      setCurrentSpare(selectedSpare)
    } else {
      await supabase.from('repair_requests')
        .update({ status: 'in_progress', notes: acceptNotes || null }).eq('id', repair.id)
    }
    setSaving(false)
    setStep('result')
  }

  // Step 2: บันทึกผล
  const handleResolve = async () => {
    if (!resultChoice) return

    // "ได้เครื่องใหม่" → ไปเลือกเครื่องก่อน ไม่ปิดทันที
    if (resultChoice === 'new') {
      setIsImmediateReplace(true)
      setStep('link_new_asset')
      return
    }

    setSaving(true)
    const resolution: RepairResolution = resultChoice === 'old' ? 'repaired' : 'waiting_new'
    await resolveRepair({
      repairId: repair.id, assetId: repair.asset_id, resolution,
      spareAssetId: currentSpare?.id || repair.spare_asset_id || undefined,
      notes: resultNotes.trim() || undefined, performed_by: userId,
    })
    setSaving(false)
    onDone()
  }

  // Step 3: ยืนยันเครื่องใหม่
  const handleLinkNewAsset = async () => {
    if (!selectedNewAsset) return
    setSaving(true)
    const supabase = createClient()

    if (isImmediateReplace) {
      // กรณี "ได้เครื่องใหม่" ทันที
      // 1. ดึง emp_id จากเครื่องเดิม
      const { data: origAsset } = await supabase.from('assets').select('emp_id').eq('id', repair.asset_id).single()
      const empId = origAsset?.emp_id ?? null

      // 2. ปิดงานซ่อม + เครื่องเดิม → damaged
      await resolveRepair({
        repairId: repair.id, assetId: repair.asset_id,
        resolution: 'replaced_new',
        spareAssetId: currentSpare?.id || repair.spare_asset_id || undefined,
        notes: resultNotes.trim() || undefined, performed_by: userId,
      })

      // 3. โอนพนักงานไปเครื่องใหม่
      if (empId) {
        const now = new Date().toISOString()
        await supabase.from('assets')
          .update({ emp_id: empId, status: 'issued', updated_at: now })
          .eq('id', selectedNewAsset.id)
        await insertAssetLog({
          asset_id: selectedNewAsset.id, action: 'assigned',
          performed_by: userId,
          detail: `โอนย้ายจากการแจ้งซ่อม ${repair.case_no ?? ''} — เครื่องเดิม ${assetInfo?.asset_no ?? ''}`,
        })
        await insertAssetLog({
          asset_id: repair.asset_id, action: 'unassigned',
          performed_by: userId,
          detail: `ย้ายผู้ใช้งานไปเครื่องใหม่ ${selectedNewAsset.asset_no} (${repair.case_no ?? ''})`,
        })
      } else {
        // ไม่มีพนักงาน → เครื่องใหม่ยังว่าง
        await insertAssetLog({
          asset_id: selectedNewAsset.id, action: 'updated',
          performed_by: userId,
          detail: `เชื่อมกับงานซ่อม ${repair.case_no ?? ''} — ไม่มีผู้ใช้งานโอน`,
        })
      }
    } else {
      // กรณี "รอเครื่องใหม่" มาก่อน
      const { data: origAsset } = await supabase.from('assets').select('emp_id').eq('id', repair.asset_id).single()
      await confirmNewAssetReceived({
        repairId: repair.id, newAssetId: selectedNewAsset.id,
        empId: origAsset?.emp_id ?? null,
        spareAssetId: currentSpare?.id || repair.spare_asset_id || undefined,
        notes: resultNotes.trim() || undefined, performed_by: userId,
      })
    }

    setSaving(false)
    onDone()
  }

  const filteredNewAssets = availableAssets.filter(a => {
    const matchCat = newAssetCategory === 'ทั้งหมด' || a.category === newAssetCategory
    const matchQ = !newAssetQuery.trim() ||
      a.asset_no.toLowerCase().includes(newAssetQuery.toLowerCase()) ||
      a.name.toLowerCase().includes(newAssetQuery.toLowerCase())
    return matchCat && matchQ
  })

  const canSaveResult = resultChoice !== null
  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Wrench size={16} /> จัดการงานซ่อม
              {repair.case_no && <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400">{repair.case_no}</span>}
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {assetInfo?.asset_no} — {assetInfo?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <StepBar current={step} showThree={showThreeSteps} />

          {/* อาการ */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">อาการ / ปัญหา</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">{repair.issue}</p>
          </div>

          {/* ══ STEP 1: รับเรื่อง ══ */}
          {step === 'accept' && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">มีเครื่อง Spare ให้ใช้ระหว่างซ่อมไหม?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setHasSpare(false); setSelectedSpare(null) }}
                    className={`py-3 rounded-xl border text-sm font-medium transition-colors ${!hasSpare ? 'bg-gray-600 border-gray-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    ❌ ไม่มี
                  </button>
                  <button type="button" onClick={() => setHasSpare(true)}
                    className={`py-3 rounded-xl border text-sm font-medium transition-colors ${hasSpare ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Package size={14} className="inline mr-1.5" />✅ มี
                  </button>
                </div>
              </div>

              {hasSpare && (
                <div className="space-y-3 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 bg-indigo-50/40 dark:bg-indigo-900/10">
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    เลือก Spare ({allSpares.length} เครื่องพร้อมใช้)
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {CATEGORIES.filter(c => c === 'ทั้งหมด' || allSpares.some(s => s.category === c)).map(cat => (
                      <button key={cat} type="button" onClick={() => setSpareCategory(cat)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${spareCategory === cat ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={spareQuery} onChange={e => setSpareQuery(e.target.value)}
                      placeholder="ค้นหา Asset No. หรือชื่อ..." className={`${inp} pl-8`} />
                  </div>
                  {filteredSpares.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-2">ไม่มี spare ในประเภทนี้</p>
                    : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {filteredSpares.map(s => {
                          const isSel = selectedSpare?.id === s.id
                          return (
                            <button key={s.id} type="button" onClick={() => setSelectedSpare(s)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm flex items-center gap-3 transition-colors ${isSel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-400' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 hover:border-indigo-300'}`}>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                {isSel && <CheckCircle2 size={12} className="text-white" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-medium">{s.asset_no}</p>
                                <p className="text-gray-700 dark:text-gray-200 truncate text-xs">{s.name}</p>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">{s.category}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  {selectedSpare && (
                    <div className="flex items-center justify-between bg-indigo-100 dark:bg-indigo-900/40 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> <span className="font-mono">{selectedSpare.asset_no}</span> — {selectedSpare.name}
                      </span>
                      <button type="button" onClick={() => setSelectedSpare(null)} className="text-indigo-400 hover:text-indigo-600 ml-2">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">หมายเหตุ</label>
                <textarea value={acceptNotes} onChange={e => setAcceptNotes(e.target.value)} rows={2} className={inp} placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  ปิด
                </button>
                <button type="button" onClick={handleAccept}
                  disabled={saving || (hasSpare && !selectedSpare)}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {saving ? 'กำลังบันทึก...' : 'รับเรื่อง — กำลังซ่อม →'}
                </button>
              </div>
            </>
          )}

          {/* ══ STEP 2: ผลลัพธ์ ══ */}
          {step === 'result' && (
            <>
              {currentSpare && (
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                  <Package size={13} />
                  Spare ที่จ่ายไป: <span className="font-mono font-medium">{currentSpare.asset_no}</span> — {currentSpare.name}
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">ผลการซ่อม</p>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setResultChoice('old')}
                    className={`p-3 rounded-xl border text-left transition-colors ${resultChoice === 'old' ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-green-400 hover:bg-green-50/40'}`}>
                    <p className="text-xl mb-1">🔧</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">ซ่อมได้</p>
                    <p className="text-xs text-gray-400 mt-0.5">คืนเครื่องเดิม</p>
                  </button>
                  <button type="button" onClick={() => setResultChoice('waiting')}
                    className={`p-3 rounded-xl border text-left transition-colors ${resultChoice === 'waiting' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-amber-400 hover:bg-amber-50/40'}`}>
                    <p className="text-xl mb-1">⏳</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">รอเครื่องใหม่</p>
                    <p className="text-xs text-gray-400 mt-0.5">ยังไม่ได้รับ</p>
                  </button>
                  <button type="button" onClick={() => setResultChoice('new')}
                    className={`p-3 rounded-xl border text-left transition-colors ${resultChoice === 'new' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-indigo-400 hover:bg-indigo-50/40'}`}>
                    <p className="text-xl mb-1">🛒</p>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">ได้เครื่องใหม่</p>
                    <p className="text-xs text-gray-400 mt-0.5">รับแล้ว — เลือกเครื่อง</p>
                  </button>
                </div>
              </div>

              {resultChoice === 'waiting' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  เครื่องเดิมจะถูกตั้งเป็น ชำรุด — เคสนี้ยังเปิดอยู่ กลับมาเลือกเครื่องใหม่ได้ภายหลัง
                </p>
              )}
              {resultChoice === 'new' && (
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2">
                  <ChevronRight size={13} className="shrink-0" />
                  กดบันทึกเพื่อเลือกเครื่องใหม่และโอนย้ายผู้ใช้งานอัตโนมัติ
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">รายละเอียดการซ่อม</label>
                <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)} rows={3} className={inp}
                  placeholder="เช่น เปลี่ยน RAM, ล้างเครื่อง, เปลี่ยน SSD..." />
              </div>

              <div className="flex gap-2 pt-1">
                {repair.status !== 'in_progress' && (
                  <button type="button" onClick={() => setStep('accept')}
                    className="flex items-center gap-1 px-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                    <ArrowLeft size={14} /> กลับ
                  </button>
                )}
                <button type="button" onClick={onClose}
                  className="px-4 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  ปิด
                </button>
                <button type="button" onClick={handleResolve} disabled={saving || !canSaveResult}
                  className={`flex-1 flex items-center justify-center gap-2 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors
                    ${resultChoice === 'waiting' ? 'bg-amber-500 hover:bg-amber-600'
                    : resultChoice === 'new' ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-green-600 hover:bg-green-700'}`}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'กำลังบันทึก...'
                    : resultChoice === 'waiting' ? '⏳ บันทึก — รอเครื่องใหม่'
                    : resultChoice === 'new' ? '🛒 ต่อไป — เลือกเครื่องใหม่ →'
                    : '✅ บันทึกผล'}
                </button>
              </div>
            </>
          )}

          {/* ══ STEP 3: เลือกเครื่องใหม่ ══ */}
          {step === 'link_new_asset' && (
            <>
              {/* Context banner */}
              {isImmediateReplace ? (
                <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl px-4 py-3">
                  <span className="text-lg shrink-0">🛒</span>
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">ได้เครื่องใหม่แล้ว</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-500 mt-0.5">
                      เลือกเครื่องใหม่ — ผู้ใช้งานจะถูกโอนย้ายอัตโนมัติ
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
                  <Clock size={15} className="text-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">รอเครื่องใหม่</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">เลือกเครื่องใหม่จากระบบเพื่อปิดงานซ่อมนี้</p>
                  </div>
                </div>
              )}

              {/* กรองประเภท */}
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.filter(c => c === 'ทั้งหมด' || availableAssets.some(a => a.category === c)).map(cat => (
                  <button key={cat} type="button" onClick={() => setNewAssetCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${newAssetCategory === cat ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400'}`}>
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={newAssetQuery} onChange={e => setNewAssetQuery(e.target.value)}
                  placeholder="ค้นหา Asset No. หรือชื่อ..." className={`${inp} pl-8`} />
              </div>

              {availableAssets.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">ไม่มีเครื่องว่างในระบบ</p>
                  <button type="button"
                    onClick={() => { onClose(); router.push('/assets/new') }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors">
                    <Plus size={13} /> เพิ่ม Asset ใหม่
                  </button>
                </div>
              ) : filteredNewAssets.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">ไม่มีเครื่องว่างในประเภทนี้</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {filteredNewAssets.map(a => {
                    const isSel = selectedNewAsset?.id === a.id
                    return (
                      <button key={a.id} type="button" onClick={() => setSelectedNewAsset(a)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm flex items-center gap-3 transition-colors ${isSel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-400' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/50 hover:border-indigo-300'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSel ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-500'}`}>
                          {isSel && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-medium">{a.asset_no}</p>
                          <p className="text-gray-700 dark:text-gray-200 truncate text-xs">{a.name}</p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">{a.category}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedNewAsset && (
                <div className="flex items-center justify-between bg-indigo-100 dark:bg-indigo-900/40 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span className="font-mono">{selectedNewAsset.asset_no}</span> — {selectedNewAsset.name}
                  </span>
                  <button type="button" onClick={() => setSelectedNewAsset(null)} className="text-indigo-400 hover:text-indigo-600 ml-2">
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* hint */}
              {isImmediateReplace && assetInfo?.emp_id && selectedNewAsset && (
                <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
                  ✅ ผู้ใช้งานจะถูกโอนย้ายจาก <span className="font-mono font-medium">{assetInfo?.asset_no}</span> → <span className="font-mono font-medium">{selectedNewAsset.asset_no}</span> อัตโนมัติ
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">หมายเหตุ</label>
                <textarea value={resultNotes} onChange={e => setResultNotes(e.target.value)} rows={2} className={inp} placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              <div className="flex gap-2 pt-1">
                {isImmediateReplace && (
                  <button type="button" onClick={() => { setStep('result'); setIsImmediateReplace(false); setSelectedNewAsset(null) }}
                    className="flex items-center gap-1 px-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                    <ArrowLeft size={14} /> กลับ
                  </button>
                )}
                <button type="button" onClick={onClose}
                  className="px-4 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  ปิด
                </button>
                <button type="button" onClick={handleLinkNewAsset} disabled={saving || !selectedNewAsset}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'กำลังบันทึก...' : '✅ ยืนยัน — ปิดงานซ่อม'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
