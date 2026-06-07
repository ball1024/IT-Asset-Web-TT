'use client'
import { useEffect, useState } from 'react'
import { approveLicenseRequest, rejectLicenseRequest, getLicenseRequests } from '@/services/licenseService'
import { getEmployeeEmails } from '@/services/employeeService'
import { useRole } from '@/hooks/useRole'
import { canViewMembers } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { KeyRound, Check, Clock, ChevronRight, X, Mail, Briefcase } from 'lucide-react'

interface RequesterInfo { name: string; email: string; position?: string }

interface Request {
  id: string
  license_id: string
  requested_by: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  asset_licenses: { name: string; asset_id: string; assets: { asset_no: string; name: string } | null } | null
}

export default function LicenseRequestsContent({ userId }: { userId: string }) {
  const { role } = useRole()
  const router = useRouter()
  const [requests, setRequests] = useState<Request[]>([])
  const [requesterInfo, setRequesterInfo] = useState<Record<string, RequesterInfo>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')

  const load = async () => {
    const data = await getLicenseRequests()
    setRequests(data as Request[])

    const ids = [...new Set((data ?? []).map((r: any) => r.requested_by))]
    if (ids.length) {
      const [userRes, emailMap] = await Promise.all([
        fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then(r => r.json()),
        getEmployeeEmails(),
      ])
      const info: Record<string, RequesterInfo> = {}
      for (const id of ids) {
        const email: string = userRes.emails?.[id] ?? ''
        const emp = emailMap[email]
        info[id] = { name: userRes.users?.[id] ?? email, email, position: emp?.position }
      }
      setRequesterInfo(info)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const approve = async (id: string) => {
    await approveLicenseRequest(id, userId)
    load()
  }

  const reject = async (id: string) => {
    await rejectLicenseRequest(id)
    load()
  }

  if (!canViewMembers(role) && !loading) {
    return <div className="p-6 text-gray-500">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  }

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }
  const filtered = requests.filter(r => filter === 'all' || r.status === filter)

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <KeyRound size={20} className="text-indigo-500" /> License Requests
        </h1>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: 'pending',  label: `รอดำเนินการ`, count: counts.pending },
            { key: 'approved', label: 'อนุมัติแล้ว',  count: counts.approved },
            { key: 'rejected', label: 'ปฏิเสธแล้ว',  count: counts.rejected },
            { key: 'all',      label: 'ทั้งหมด',      count: requests.length },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {f.label}
              {f.count > 0 && <span className={`text-xs tabular-nums ${filter === f.key ? 'text-white/70' : 'text-gray-400'}`}>{f.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm p-4">กำลังโหลด...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <KeyRound size={32} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">ไม่มีรายการ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => {
            const info = requesterInfo[req.requested_by]
            const asset = req.asset_licenses?.assets
            return (
              <div key={req.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                    req.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                    req.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                    'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                  }`}>
                    {(info?.name ?? '?').charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* ชื่อ + ตำแหน่ง + email */}
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{info?.name ?? '...'}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {info?.position && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Briefcase size={10} /> {info.position}
                        </span>
                      )}
                      {info?.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Mail size={10} /> {info.email}
                        </span>
                      )}
                    </div>

                    {/* License + Asset */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                        <KeyRound size={10} /> {req.asset_licenses?.name}
                      </span>
                      {asset && (
                        <button onClick={() => router.push(`/assets/${req.asset_licenses?.asset_id}`)}
                          className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 transition-colors">
                          <span className="font-mono">{asset.asset_no}</span> · {asset.name} <ChevronRight size={10} />
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                      {new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Status / Actions */}
                  <div className="shrink-0">
                    {req.status === 'pending' ? (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={() => approve(req.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                          <Check size={12} /> อนุมัติ
                        </button>
                        <button onClick={() => reject(req.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors">
                          <X size={12} /> ปฏิเสธ
                        </button>
                      </div>
                    ) : req.status === 'approved' ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                        <Check size={13} /> อนุมัติแล้ว
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium">
                        <X size={13} /> ปฏิเสธแล้ว
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
