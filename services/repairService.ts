import { createClient } from '@/lib/supabase'
import { insertAssetLog } from '@/lib/logging'
import type { RepairRequest, RepairResolution } from '@/lib/supabase'

export async function getRepairRequests(): Promise<RepairRequest[]> {
  const { data, error } = await createClient()
    .from('repair_requests')
    .select('*, case_no, assets!repair_requests_asset_id_fkey(id,asset_no,name,category)')
    .order('reported_at', { ascending: false })
  if (error) console.error('getRepairRequests error:', error.code, error.message)
  return (data ?? []) as RepairRequest[]
}

export async function getRepairsByAsset(assetId: string): Promise<RepairRequest[]> {
  const { data } = await createClient()
    .from('repair_requests')
    .select('*, case_no')
    .eq('asset_id', assetId)
    .order('reported_at', { ascending: false })
  return (data ?? []) as RepairRequest[]
}

export async function getActiveRepairByAsset(assetId: string): Promise<RepairRequest | null> {
  const { data } = await createClient()
    .from('repair_requests')
    .select('id,status,issue')
    .eq('asset_id', assetId)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()
  return (data ?? null) as RepairRequest | null
}

export async function createRepairRequest(payload: {
  asset_id: string
  reported_by?: string
  issue: string
  notes?: string
  performed_by?: string
}): Promise<{ data: RepairRequest | null; error?: string }> {
  const supabase = createClient()

  // ตรวจสอบว่ามี repair ที่ยังเปิดอยู่ไหม
  const active = await getActiveRepairByAsset(payload.asset_id)
  if (active) {
    return { data: null, error: `เครื่องนี้มีการแจ้งซ่อมที่ยังดำเนินการอยู่ (${active.status === 'pending' ? 'รอดำเนินการ' : 'กำลังซ่อม'}) — ต้องรอซ่อมเสร็จก่อน` }
  }

  const { data, error } = await supabase
    .from('repair_requests')
    .insert({ asset_id: payload.asset_id, reported_by: payload.reported_by, issue: payload.issue, notes: payload.notes, status: 'pending' })
    .select()
    .single()

  if (error || !data) {
    console.error('createRepairRequest error:', (error as any)?.code, (error as any)?.message)
    return { data: null, error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' }
  }

  // เปลี่ยน asset status → repair
  const { error: assetErr } = await supabase
    .from('assets')
    .update({ status: 'repair', updated_at: new Date().toISOString() })
    .eq('id', payload.asset_id)
  if (assetErr) console.error('asset status update error:', assetErr.code, assetErr.message)

  try {
    await insertAssetLog({
      asset_id: payload.asset_id,
      action: 'repair_requested',
      detail: `แจ้งซ่อม: ${payload.issue}`,
      performed_by: payload.performed_by,
      repair_request_id: data.id,
    })
  } catch (logErr) {
    console.warn('insertAssetLog failed (repair_request_id column missing?):', logErr)
  }

  return { data: data as RepairRequest }
}

export async function assignSpare(payload: {
  repairId: string
  assetId: string
  spareAssetId: string
  empId?: string
  performed_by?: string
}): Promise<void> {
  const supabase = createClient()

  await supabase.from('repair_requests').update({ spare_asset_id: payload.spareAssetId, status: 'in_progress' }).eq('id', payload.repairId)

  // spare → issued (ให้ emp เดิม)
  await supabase.from('assets').update({
    status: 'issued',
    emp_id: payload.empId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', payload.spareAssetId)

  await insertAssetLog({
    asset_id: payload.spareAssetId,
    action: 'spare_assigned',
    detail: `จ่าย spare แทนระหว่างซ่อม (repair #${payload.repairId.slice(0, 8)})`,
    performed_by: payload.performed_by,
    repair_request_id: payload.repairId,
  })
}

export async function confirmNewAssetReceived(payload: {
  repairId: string
  newAssetId: string
  empId?: string | null
  spareAssetId?: string
  notes?: string
  performed_by?: string
}): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()

  await supabase.from('repair_requests').update({
    status: 'resolved',
    resolution: 'replaced_new',
    resolved_by: payload.performed_by,
    resolved_at: now,
    notes: payload.notes ?? null,
  }).eq('id', payload.repairId)

  // มอบหมายเครื่องใหม่ให้ผู้ใช้เดิม
  await supabase.from('assets').update({
    status: payload.empId ? 'issued' : 'available',
    emp_id: payload.empId ?? null,
    updated_at: now,
  }).eq('id', payload.newAssetId)

  await insertAssetLog({
    asset_id: payload.newAssetId,
    action: 'assigned',
    detail: `เครื่องทดแทน (repair #${payload.repairId.slice(0, 8)})${payload.empId ? ` → ${payload.empId}` : ''}`,
    performed_by: payload.performed_by,
    repair_request_id: payload.repairId,
  })

  if (payload.spareAssetId) {
    await supabase.from('assets').update({ status: 'spare', emp_id: null, updated_at: now }).eq('id', payload.spareAssetId)
    await insertAssetLog({ asset_id: payload.spareAssetId, action: 'spare_returned', detail: 'คืน spare — ได้รับเครื่องใหม่แล้ว', performed_by: payload.performed_by, repair_request_id: payload.repairId })
  }
}

export async function resolveRepair(payload: {
  repairId: string
  assetId: string
  resolution: RepairResolution
  spareAssetId?: string
  notes?: string
  performed_by?: string
}): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()

  // ดึง emp_id เดิมของเครื่องที่เสีย (ยังอยู่ที่ asset เพราะแค่เปลี่ยน status ไม่ได้ล้าง emp_id)
  const { data: origAsset } = await supabase.from('assets').select('emp_id').eq('id', payload.assetId).single()
  const empId = origAsset?.emp_id ?? null

  await supabase.from('repair_requests').update({
    status: 'resolved',
    resolution: payload.resolution,
    resolved_by: payload.performed_by,
    resolved_at: now,
    notes: payload.notes,
  }).eq('id', payload.repairId)

  if (payload.resolution === 'repaired') {
    // ซ่อมได้ → เครื่องเดิม issued กลับหาผู้ใช้เดิม
    await supabase.from('assets').update({ status: 'issued', emp_id: empId, updated_at: now }).eq('id', payload.assetId)
    await insertAssetLog({ asset_id: payload.assetId, action: 'repair_resolved', detail: `ซ่อมเสร็จ — คืนเครื่องให้ผู้ใช้${empId ? ` (${empId})` : ''}`, performed_by: payload.performed_by, repair_request_id: payload.repairId })

    if (payload.spareAssetId) {
      // spare คืน stock → เคลียร์ผู้ถือ
      await supabase.from('assets').update({ status: 'spare', emp_id: null, updated_at: now }).eq('id', payload.spareAssetId)
      await insertAssetLog({ asset_id: payload.spareAssetId, action: 'spare_returned', detail: 'คืน spare หลังซ่อมเสร็จ', performed_by: payload.performed_by, repair_request_id: payload.repairId })
    }

  } else if (payload.resolution === 'replaced_spare') {
    // ซ่อมไม่ได้ — ผู้ใช้ใช้ spare ต่อถาวร
    // เครื่องเดิม → damaged รอ admin ยืนยัน writeoff
    await supabase.from('assets').update({ status: 'damaged', emp_id: null, updated_at: now }).eq('id', payload.assetId)
    await insertAssetLog({ asset_id: payload.assetId, action: 'damaged', detail: 'ซ่อมไม่ได้ — รอตัดจำหน่าย (ผู้ใช้ใช้ spare แทน)', performed_by: payload.performed_by, repair_request_id: payload.repairId })

    if (payload.spareAssetId) {
      // spare → issued ถาวร ให้ emp เดิม (spare กลายเป็นเครื่องประจำแล้ว)
      await supabase.from('assets').update({ status: 'issued', emp_id: empId, updated_at: now }).eq('id', payload.spareAssetId)
      await insertAssetLog({ asset_id: payload.spareAssetId, action: 'repair_resolved', detail: `Spare กลายเป็นเครื่องประจำของ ${empId ?? 'ผู้ใช้'}`, performed_by: payload.performed_by, repair_request_id: payload.repairId })
    }

  } else if (payload.resolution === 'replaced_new') {
    // ซื้อใหม่ ได้รับแล้ว — เครื่องเดิม → damaged รอ admin ยืนยัน writeoff
    await supabase.from('assets').update({ status: 'damaged', emp_id: null, updated_at: now }).eq('id', payload.assetId)
    await insertAssetLog({ asset_id: payload.assetId, action: 'damaged', detail: 'ซ่อมไม่ได้ — รอตัดจำหน่าย (ได้รับเครื่องใหม่แล้ว)', performed_by: payload.performed_by, repair_request_id: payload.repairId })

    if (payload.spareAssetId) {
      await supabase.from('assets').update({ status: 'spare', emp_id: null, updated_at: now }).eq('id', payload.spareAssetId)
      await insertAssetLog({ asset_id: payload.spareAssetId, action: 'spare_returned', detail: 'คืน spare — ได้รับเครื่องใหม่แล้ว', performed_by: payload.performed_by, repair_request_id: payload.repairId })
    }

  } else if (payload.resolution === 'waiting_new') {
    // รอเครื่องใหม่ — เครื่องเดิม writeoff แต่ repair ยังไม่ปิด (status = in_progress)
    await supabase.from('repair_requests').update({
      status: 'in_progress',  // ยังเปิดอยู่ รอเครื่องใหม่
      resolution: 'waiting_new',
      resolved_by: payload.performed_by,
      notes: payload.notes,
    }).eq('id', payload.repairId)

    await supabase.from('assets').update({ status: 'damaged', emp_id: null, updated_at: now }).eq('id', payload.assetId)
    await insertAssetLog({ asset_id: payload.assetId, action: 'damaged', detail: 'ซ่อมไม่ได้ — รอตัดจำหน่าย (รอเครื่องใหม่)', performed_by: payload.performed_by, repair_request_id: payload.repairId })

    if (payload.spareAssetId) {
      // ถ้ามี spare ให้ยังถือต่อไปก่อน (ไม่คืน)
      await insertAssetLog({ asset_id: payload.spareAssetId, action: 'updated', detail: 'ยังใช้ spare ระหว่างรอเครื่องใหม่', performed_by: payload.performed_by, repair_request_id: payload.repairId })
    }
    return // ออกก่อน ไม่ set resolved
  }
}
