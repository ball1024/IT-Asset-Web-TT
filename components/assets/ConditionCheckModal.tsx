'use client'
import { useState } from 'react'
import { ClipboardCheck, Battery, Monitor, Cpu, Package } from 'lucide-react'
import type { Asset, ConditionRating } from '@/lib/supabase'
import {
  CONDITION_ITEMS_BY_CATEGORY,
  ACCESSORIES_BY_CATEGORY,
  CONDITION_ITEM_LABELS,
  ACCESSORY_LABELS,
} from '@/lib/supabase'
import { createConditionCheck, updateConditionCheck } from '@/services/conditionCheckService'
import type { ConditionCheck } from '@/lib/supabase'

interface Props {
  asset: Asset
  checkType: 'handover' | 'return'
  empId?: string
  userId: string
  onDone: () => void
  initialData?: ConditionCheck
}

const RATINGS: { value: ConditionRating; label: string; emoji: string; color: string }[] = [
  { value: 'new',  label: 'ใหม่',   emoji: '✨', color: 'bg-sky-50 border-sky-400 text-sky-700 dark:bg-sky-900/40 dark:border-sky-500 dark:text-sky-300' },
  { value: 'good', label: 'ดี',     emoji: '✅', color: 'bg-green-50 border-green-400 text-green-700 dark:bg-green-900/40 dark:border-green-500 dark:text-green-300' },
  { value: 'fair', label: 'พอใช้', emoji: '⚠️', color: 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-900/40 dark:border-amber-500 dark:text-amber-300' },
  { value: 'poor', label: 'แย่',    emoji: '❌', color: 'bg-red-50 border-red-400 text-red-700 dark:bg-red-900/40 dark:border-red-500 dark:text-red-300' },
]

// ตัวเลือก sub-detail ตาม item key
const SCREEN_DETAILS = [
  { value: 'normal',     label: 'ปกติ' },
  { value: 'scratch',    label: 'รอยขีด' },
  { value: 'dead_pixel', label: 'จุดเสีย' },
  { value: 'cracked',    label: 'แตกร้าว' },
]

const BODY_DETAILS = [
  { value: 'normal',        label: 'ปกติ' },
  { value: 'minor_scratch', label: 'รอยขีดเล็กน้อย' },
  { value: 'heavy_scratch', label: 'รอยขีดมาก' },
  { value: 'dented',        label: 'บุบ/บิ่น' },
]

function getItemsForCategory(category: string): string[] {
  const key = category.toLowerCase()
  return CONDITION_ITEMS_BY_CATEGORY[key] ?? CONDITION_ITEMS_BY_CATEGORY['default']
}

function getAccessoriesForCategory(category: string): string[] {
  const key = category.toLowerCase()
  return ACCESSORIES_BY_CATEGORY[key] ?? ACCESSORIES_BY_CATEGORY['default']
}

function DetailChips({
  options, value, onChange,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 ml-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 py-0.5 rounded-full text-xs border transition-all ${
            value === o.value
              ? 'bg-indigo-100 border-indigo-400 text-indigo-700 dark:bg-indigo-900/50 dark:border-indigo-400 dark:text-indigo-300 font-medium'
              : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const RATING_PRIORITY: ConditionRating[] = ['poor', 'fair', 'good', 'new']

function calcOverall(items: Record<string, ConditionRating>): ConditionRating | null {
  const vals = Object.values(items)
  if (!vals.length) return null
  for (const r of RATING_PRIORITY) {
    if (vals.includes(r)) return r
  }
  return 'good'
}

export default function ConditionCheckModal({ asset, checkType, empId, userId, onDone, initialData }: Props) {
  const items = getItemsForCategory(asset.category)
  const accList = getAccessoriesForCategory(asset.category)

  const [conditionItems, setConditionItems] = useState<Record<string, ConditionRating>>(
    () => (initialData?.condition_items ?? {}) as Record<string, ConditionRating>
  )
  const [itemDetails, setItemDetails] = useState<Record<string, string>>(
    () => initialData?.item_details ?? {}
  )
  const [accessories, setAccessories] = useState<Record<string, boolean>>(
    () => {
      const base = Object.fromEntries(accList.map(a => [a, false]))
      return { ...base, ...(initialData?.accessories ?? {}) }
    }
  )
  const [notes, setNotes] = useState(() => initialData?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const overall = calcOverall(conditionItems)

  const setItem = (key: string, val: ConditionRating) =>
    setConditionItems(prev => ({ ...prev, [key]: val }))

  const setDetail = (key: string, val: string) =>
    setItemDetails(prev => ({ ...prev, [key]: val }))

  const toggleAcc = (key: string) =>
    setAccessories(prev => ({ ...prev, [key]: !prev[key] }))

  const toggleAllAcc = () => {
    const allChecked = accList.every(a => accessories[a])
    setAccessories(prev => Object.fromEntries(accList.map(a => [a, !allChecked])))
  }

  const accTotal = accList.length
  const accChecked = accList.filter(a => accessories[a]).length

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      asset_id: asset.id,
      check_type: checkType,
      overall_condition: overall ?? undefined,
      condition_items: conditionItems,
      item_details: itemDetails,
      accessories,
      notes: notes.trim() || undefined,
      performed_by: userId,
      emp_id: empId,
    }
    if (initialData?.id) {
      await updateConditionCheck(initialData.id, payload)
    } else {
      await createConditionCheck(payload)
    }
    setSaving(false)
    onDone()
  }

  const typeLabel = checkType === 'handover' ? 'ส่งมอบ' : 'รับคืน'
  const typeBadge = checkType === 'handover'
    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    : 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'

  const inp = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
  const sectionTitle = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start p-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck size={16} className="text-indigo-500" />
              <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">ตรวจสภาพเครื่อง</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge}`}>{typeLabel}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono text-indigo-600 dark:text-indigo-400">{asset.asset_no}</span>
              {' '}· {asset.name}
              {empId && <span className="ml-1">· {empId}</span>}
            </p>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* สภาพโดยรวม — คำนวณอัตโนมัติ */}
          <div className="flex items-center justify-between">
            <p className={sectionTitle + ' mb-0'}>สภาพโดยรวม</p>
            {overall ? (
              <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${RATINGS.find(r => r.value === overall)?.color ?? ''}`}>
                {RATINGS.find(r => r.value === overall)?.emoji} {RATINGS.find(r => r.value === overall)?.label}
              </span>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">คำนวณจากรายการตรวจ</span>
            )}
          </div>

          {/* สภาพตัวเครื่อง — แยก section */}
          {items.includes('body') && (
            <div>
              <p className={sectionTitle}>สภาพตัวเครื่อง</p>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Cpu size={13} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">สภาพโดยรอบ</span>
                  </div>
                  <div className="flex gap-1.5">
                    {RATINGS.map(r => (
                      <button key={r.value} onClick={() => setItem('body', r.value)}
                        title={r.label}
                        className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all ${conditionItems['body'] === r.value ? r.color : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300'}`}>
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <DetailChips
                  options={BODY_DETAILS}
                  value={itemDetails['body_detail'] ?? ''}
                  onChange={v => setDetail('body_detail', v)}
                />
              </div>
            </div>
          )}

          {/* รายการตรวจอื่นๆ */}
          {items.filter(i => i !== 'body').length > 0 && (
            <div>
              <p className={sectionTitle}>รายการตรวจ</p>
              <div className="space-y-3">
                {items.filter(i => i !== 'body').map(item => (
                  <div key={item} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                    {/* Row: ชื่อ + rating */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {item === 'battery' && <Battery size={13} className="text-gray-400" />}
                        {item === 'screen' && <Monitor size={13} className="text-gray-400" />}
                        {(item === 'body' || item === 'keyboard' || item === 'ports' || item === 'cables' || item === 'mouse' || item === 'charger') && <Cpu size={13} className="text-gray-400" />}
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {CONDITION_ITEM_LABELS[item] ?? item}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {RATINGS.map(r => (
                          <button key={r.value} onClick={() => setItem(item, r.value)}
                            title={r.label}
                            className={`px-2 py-1 rounded-lg border text-xs font-medium transition-all ${conditionItems[item] === r.value ? r.color : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300'}`}>
                            {r.emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sub-detail: แบตเตอรี่ % */}
                    {item === 'battery' && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">เหลือโดยประมาณ</span>
                        <input
                          type="number" min={0} max={100}
                          value={itemDetails['battery_pct'] ?? ''}
                          onChange={e => setDetail('battery_pct', e.target.value)}
                          placeholder="—"
                          className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                        {itemDetails['battery_pct'] && (
                          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                Number(itemDetails['battery_pct']) >= 70 ? 'bg-green-500' :
                                Number(itemDetails['battery_pct']) >= 40 ? 'bg-amber-400' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, Number(itemDetails['battery_pct'])))}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-detail: จอภาพ */}
                    {item === 'screen' && (
                      <DetailChips
                        options={SCREEN_DETAILS}
                        value={itemDetails['screen_detail'] ?? ''}
                        onChange={v => setDetail('screen_detail', v)}
                      />
                    )}

                  </div>
                ))}
              </div>
            </div>
          )}

          {/* อุปกรณ์ที่มาด้วย */}
          {accList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={sectionTitle + ' mb-0'}>อุปกรณ์ที่มาด้วย</p>
                {accTotal > 0 && (
                  <button type="button" onClick={toggleAllAcc}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      accChecked === accTotal
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                        : accChecked === 0
                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-300'
                    }`}>
                    {accChecked === accTotal ? '✓ ครบทุกชิ้น' : `ติ๊กทั้งหมด (${accChecked}/${accTotal})`}
                  </button>
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 space-y-2">
                {accList.map(acc => (
                  <label key={acc} className="flex items-center gap-2.5 cursor-pointer group">
                    <input type="checkbox" checked={accessories[acc] ?? false} onChange={() => toggleAcc(acc)}
                      className="w-4 h-4 rounded accent-indigo-600" />
                    <div className="flex items-center gap-1.5 flex-1">
                      <Package size={12} className="text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                        {ACCESSORY_LABELS[acc] ?? acc}
                      </span>
                    </div>
                    {accessories[acc]
                      ? <span className="text-xs text-green-600 dark:text-green-400">มี</span>
                      : <span className="text-xs text-gray-400">ไม่มี</span>
                    }
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* หมายเหตุ */}
          <div>
            <p className={sectionTitle}>หมายเหตุ</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="บันทึกรายละเอียดเพิ่มเติม (ถ้ามี)"
              rows={2}
              className={inp} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
          <button onClick={onDone}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            ข้ามขั้นตอนนี้
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'กำลังบันทึก...' : initialData?.id ? 'บันทึกการแก้ไข' : 'บันทึกสภาพ'}
          </button>
        </div>
      </div>
    </div>
  )
}
