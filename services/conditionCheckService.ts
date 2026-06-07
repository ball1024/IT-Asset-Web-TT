import { createClient } from '@/lib/supabase'
import type { ConditionCheck } from '@/lib/supabase'
import { CONDITION_ITEM_LABELS, ACCESSORY_LABELS } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'

const RATING_LABELS: Record<string, string> = { new: 'ใหม่', good: 'ดี', fair: 'พอใช้', poor: 'แย่' }

export async function createConditionCheck(
  payload: Omit<ConditionCheck, 'id' | 'created_at'>
): Promise<void> {
  const supabase = createClient()
  const row = { ...payload, item_details: payload.item_details ?? {} }
  await supabase.from('asset_condition_checks').insert(row)

  const typeLabel = payload.check_type === 'handover' ? 'ส่งมอบ' : 'รับคืน'
  const overallLabel = payload.overall_condition ? RATING_LABELS[payload.overall_condition] : null

  const lines: string[] = []
  lines.push(`ตรวจสภาพ (${typeLabel})${payload.emp_id ? ` · ${payload.emp_id}` : ''}`)
  if (overallLabel) lines.push(`สภาพโดยรวม: ${overallLabel}`)

  // รายการตรวจแต่ละชิ้น
  for (const [key, rating] of Object.entries(payload.condition_items)) {
    const itemLabel = CONDITION_ITEM_LABELS[key] ?? key
    const ratingLabel = RATING_LABELS[rating] ?? rating
    let extra = ''
    if (key === 'battery' && payload.item_details?.['battery_pct']) {
      extra = ` (เหลือ ${payload.item_details['battery_pct']}%)`
    } else if (key === 'screen' && payload.item_details?.['screen_detail']) {
      const d = payload.item_details['screen_detail']
      const detailMap: Record<string, string> = { normal: 'ปกติ', scratch: 'รอยขีด', dead_pixel: 'จุดเสีย', cracked: 'แตกร้าว' }
      extra = ` (${detailMap[d] ?? d})`
    } else if (key === 'body' && payload.item_details?.['body_detail']) {
      const d = payload.item_details['body_detail']
      const detailMap: Record<string, string> = { normal: 'ปกติ', minor_scratch: 'รอยขีดเล็กน้อย', heavy_scratch: 'รอยขีดมาก', dented: 'บุบ/บิ่น' }
      extra = ` (${detailMap[d] ?? d})`
    }
    lines.push(`${itemLabel}: ${ratingLabel}${extra}`)
  }

  // อุปกรณ์
  if (Object.keys(payload.accessories).length > 0) {
    const present = Object.entries(payload.accessories).filter(([, v]) => v).map(([k]) => ACCESSORY_LABELS[k] ?? k)
    const absent  = Object.entries(payload.accessories).filter(([, v]) => !v).map(([k]) => ACCESSORY_LABELS[k] ?? k)
    const total = Object.keys(payload.accessories).length
    lines.push(`อุปกรณ์: ${present.length}/${total} ชิ้น${absent.length ? ` (ขาด: ${absent.join(', ')})` : ' (ครบ)'}`)
  }

  await insertAssetLog({
    asset_id: payload.asset_id,
    action: 'condition_check',
    detail: lines.join('\n'),
    performed_by: payload.performed_by,
  })
}

export async function updateConditionCheck(
  id: string,
  payload: Omit<ConditionCheck, 'id' | 'created_at'>
): Promise<void> {
  const supabase = createClient()
  await supabase.from('asset_condition_checks').update({
    check_type: payload.check_type,
    overall_condition: payload.overall_condition ?? null,
    condition_items: payload.condition_items,
    item_details: payload.item_details ?? {},
    accessories: payload.accessories,
    notes: payload.notes ?? null,
    performed_by: payload.performed_by,
    emp_id: payload.emp_id,
  }).eq('id', id)

  const typeLabel = payload.check_type === 'handover' ? 'ส่งมอบ' : 'รับคืน'
  const overallLabel = payload.overall_condition ? RATING_LABELS[payload.overall_condition] : null

  const lines: string[] = []
  lines.push(`แก้ไขสภาพ (${typeLabel})${payload.emp_id ? ` · ${payload.emp_id}` : ''}`)
  if (overallLabel) lines.push(`สภาพโดยรวม: ${overallLabel}`)

  for (const [key, rating] of Object.entries(payload.condition_items)) {
    const itemLabel = CONDITION_ITEM_LABELS[key] ?? key
    const ratingLabel = RATING_LABELS[rating] ?? rating
    let extra = ''
    if (key === 'battery' && payload.item_details?.['battery_pct']) {
      extra = ` (เหลือ ${payload.item_details['battery_pct']}%)`
    } else if (key === 'screen' && payload.item_details?.['screen_detail']) {
      const d = payload.item_details['screen_detail']
      const detailMap: Record<string, string> = { normal: 'ปกติ', scratch: 'รอยขีด', dead_pixel: 'จุดเสีย', cracked: 'แตกร้าว' }
      extra = ` (${detailMap[d] ?? d})`
    } else if (key === 'body' && payload.item_details?.['body_detail']) {
      const d = payload.item_details['body_detail']
      const detailMap: Record<string, string> = { normal: 'ปกติ', minor_scratch: 'รอยขีดเล็กน้อย', heavy_scratch: 'รอยขีดมาก', dented: 'บุบ/บิ่น' }
      extra = ` (${detailMap[d] ?? d})`
    }
    lines.push(`${itemLabel}: ${ratingLabel}${extra}`)
  }

  if (Object.keys(payload.accessories).length > 0) {
    const present = Object.entries(payload.accessories).filter(([, v]) => v).map(([k]) => ACCESSORY_LABELS[k] ?? k)
    const absent  = Object.entries(payload.accessories).filter(([, v]) => !v).map(([k]) => ACCESSORY_LABELS[k] ?? k)
    const total = Object.keys(payload.accessories).length
    lines.push(`อุปกรณ์: ${present.length}/${total} ชิ้น${absent.length ? ` (ขาด: ${absent.join(', ')})` : ' (ครบ)'}`)
  }

  await insertAssetLog({
    asset_id: payload.asset_id,
    action: 'condition_check',
    detail: lines.join('\n'),
    performed_by: payload.performed_by,
  })
}

export async function getLastHandoverByAsset(assetId: string): Promise<ConditionCheck | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('asset_condition_checks')
    .select('*')
    .eq('asset_id', assetId)
    .eq('check_type', 'handover')
    .order('created_at', { ascending: false })
    .limit(1)
  return ((data?.[0] ?? null) as ConditionCheck | null)
}

export async function getConditionChecksByAsset(assetId: string): Promise<ConditionCheck[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('asset_condition_checks')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
  return (data ?? []) as ConditionCheck[]
}
