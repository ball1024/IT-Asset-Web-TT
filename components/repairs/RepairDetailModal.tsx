'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { RepairRequest } from '@/lib/supabase'
import { X, Wrench, Package, Clock, CheckCircle2, User } from 'lucide-react'

interface Props {
  repair: RepairRequest
  repairNo: number
  onClose: () => void
}

const STATUS_MAP = {
  pending:     { label: 'รอดำเนินการ', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: '⏳' },
  in_progress: { label: 'กำลังซ่อม',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',   icon: '🔧' },
  resolved:    { label: 'เสร็จสิ้น',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: '✅' },
}

const RESOLUTION_MAP: Record<string, { label: string; icon: string; desc: string }> = {
  repaired:       { label: 'ซ่อมได้',              icon: '✅', desc: 'ซ่อมเสร็จ คืนเครื่องเดิมให้ผู้ใช้' },
  replaced_spare: { label: 'ใช้ Spare แทน',        icon: '🔄', desc: 'ซ่อมไม่ได้ ผู้ใช้ใช้ spare ต่อ เครื่องเดิม writeoff' },
  replaced_new:   { label: 'ได้รับเครื่องใหม่แล้ว', icon: '🛒', desc: 'ซ่อมไม่ได้ ได้รับเครื่องใหม่แล้ว เครื่องเดิม writeoff' },
  waiting_new:    { label: 'รอเครื่องใหม่',         icon: '⏳', desc: 'ซ่อมไม่ได้ รอสั่งซื้อเครื่องใหม่ เครื่องเดิม writeoff' },
}

export default function RepairDetailModal({ repair, repairNo, onClose }: Props) {
  const [reporterName, setReporterName] = useState<string | null>(null)
  const [resolverName, setResolverName] = useState<string | null>(null)
  const [spareAsset, setSpareAsset] = useState<{ asset_no: string; name: string; id: string } | null>(null)
  const [logs, setLogs] = useState<{ action: string; detail?: string; created_at: string }[]>([])

  const assetInfo = repair.assets as any
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const days = (a: string, b?: string) => Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 86400000)

  useEffect(() => {
    const supabase = createClient()

    // โหลดชื่อผู้แจ้ง
    if (repair.reported_by) {
      supabase.from('employees').select('full_name_th').eq('emp_id', repair.reported_by).single()
        .then(({ data }) => { if (data) setReporterName(data.full_name_th) })
    }

    // โหลดชื่อ IT ที่แก้ไข
    if (repair.resolved_by) {
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [repair.resolved_by] }),
      })
        .then(r => r.json())
        .then(data => {
          const name = (data.users ?? data)[repair.resolved_by!]
          setResolverName(name ?? null)
        })
        .catch(() => {})
    }

    // โหลด spare asset
    if (repair.spare_asset_id) {
      supabase.from('assets').select('id,asset_no,name').eq('id', repair.spare_asset_id).single()
        .then(({ data }) => { if (data) setSpareAsset(data as any) })
    }

    // โหลด asset logs ที่เกี่ยวกับ repair นี้
    supabase.from('asset_logs').select('action,detail,created_at')
      .eq('repair_request_id', repair.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setLogs(data ?? []))
  }, [repair])

  const status = STATUS_MAP[repair.status]
  const resolution = repair.resolution ? RESOLUTION_MAP[repair.resolution] : null

  const ACTION_LABELS: Record<string, string> = {
    repair_requested: 'แจ้งซ่อม',
    spare_assigned:   'จ่าย Spare',
    repair_resolved:  'ซ่อมเสร็จ',
    spare_returned:   'คืน Spare',
    writeoff:         'ตัดจำหน่าย',
    updated:          'อัปเดต',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Wrench size={16} />
              <span className="font-mono text-indigo-600 dark:text-indigo-400">{repair.case_no ?? `#${repairNo}`}</span>
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {assetInfo?.asset_no} — {assetInfo?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Status + resolution */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
              {status.icon} {status.label}
            </span>
            {resolution && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {resolution.icon} {resolution.label}
              </span>
            )}
          </div>

          {/* อาการ */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">อาการ / ปัญหา</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">{repair.issue}</p>
          </div>

          {/* ข้อมูลหลัก */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><User size={11} /> ผู้แจ้ง</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {reporterName ?? repair.reported_by ?? '—'}
              </p>
              {reporterName && repair.reported_by && (
                <p className="text-xs text-gray-400 font-mono">{repair.reported_by}</p>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><Clock size={11} /> วันที่แจ้ง</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{fmt(repair.reported_at)}</p>
            </div>
            {repair.resolved_at && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><CheckCircle2 size={11} /> วันที่เสร็จ</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{fmt(repair.resolved_at)}</p>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><Clock size={11} /> ระยะเวลา</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {repair.status === 'resolved'
                  ? `${days(repair.reported_at, repair.resolved_at)} วัน`
                  : `${days(repair.reported_at)} วันแล้ว`}
              </p>
            </div>
          </div>

          {/* Spare */}
          {spareAsset && (
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3">
              <Package size={16} className="text-blue-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-0.5">Spare ที่จ่ายระหว่างซ่อม</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">{spareAsset.asset_no}</span>
                  <span className="ml-1.5 text-gray-500 dark:text-gray-400">— {spareAsset.name}</span>
                </p>
              </div>
            </div>
          )}

          {/* ผลลัพธ์ */}
          {resolution && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">ผลการซ่อม</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{resolution.icon} {resolution.label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{resolution.desc}</p>
              {resolverName && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">โดย: {resolverName}</p>
              )}
            </div>
          )}

          {/* หมายเหตุ */}
          {repair.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">หมายเหตุ</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">{repair.notes}</p>
            </div>
          )}

          {/* Timeline logs */}
          {logs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Timeline</p>
              <div className="relative pl-5 space-y-3">
                <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />
                {logs.map((log, i) => (
                  <div key={i} className="relative flex gap-3">
                    <div className="absolute -left-3.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white dark:border-gray-800 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </p>
                      {log.detail && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{log.detail}</p>}
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">{fmt(log.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
