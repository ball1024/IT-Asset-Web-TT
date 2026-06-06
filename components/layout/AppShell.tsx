'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Toast from '@/components/ui/Toast'
import { Menu, User, ChevronDown, Bell, KeyRound, ChevronRight, Check, X, Clock } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/hooks/useRole'
import { useLicenseRequests, useMyLicenseNotifications } from '@/hooks/useLicenseRequests'
import { approveLicenseRequest, rejectLicenseRequest } from '@/services/licenseService'
import { getEmployeeEmails } from '@/services/employeeService'

const ROLE_LABEL: Record<string, string> = {
  master_admin: 'Master Admin', admin: 'Admin', user: 'User', view: 'View',
}
const ROLE_COLOR: Record<string, string> = {
  master_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  view: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

function UserMenu() {
  const { role } = useRole()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setDisplayName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User')
    })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {avatarLetter}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{displayName}</p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_COLOR[role ?? ''] ?? ROLE_COLOR.view}`}>
            {ROLE_LABEL[role ?? ''] ?? role}
          </span>
        </div>
        <ChevronDown size={14} className={`text-gray-400 hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => { setOpen(false); router.push('/profile') }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <User size={15} /> ข้อมูลผู้ใช้
          </button>
        </div>
      )}
    </div>
  )
}

interface RequesterInfo { name: string; email: string; position?: string }

function NotificationBell({ isAdmin, userId }: { isAdmin: boolean; userId: string | null }) {
  const router = useRouter()

  // Admin hooks
  const { pendingCount, pendingList, newRequest, clearNewRequest, reload } = useLicenseRequests(isAdmin)
  const [requesterInfo, setRequesterInfo] = useState<Record<string, RequesterInfo>>({})

  // User hooks
  const { myUpdates, latestUpdate, clearLatestUpdate } = useMyLicenseNotifications(!isAdmin ? userId : null)

  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Admin: แจ้งเตือนคำขอใหม่
  useEffect(() => {
    if (!newRequest) return
    setToast({ msg: `มีคำขอดู License ใหม่`, type: 'info' })
    clearNewRequest()
  }, [newRequest])

  // User: แจ้งเตือนเมื่อได้รับการอนุมัติ/ปฏิเสธ
  useEffect(() => {
    if (!latestUpdate) return
    const name = latestUpdate.asset_licenses?.name ?? 'License'
    if (latestUpdate.status === 'approved') {
      setToast({ msg: `คำขอดู "${name}" ได้รับการอนุมัติแล้ว`, type: 'success' })
    } else if (latestUpdate.status === 'rejected') {
      setToast({ msg: `คำขอดู "${name}" ถูกปฏิเสธ`, type: 'error' })
    }
    clearLatestUpdate()
  }, [latestUpdate])

  // โหลดข้อมูล requester (ชื่อ email) + ตำแหน่งจาก employees
  useEffect(() => {
    if (!open || !isAdmin || !pendingList.length) return
    const ids = [...new Set(pendingList.map(r => r.requested_by))]
    Promise.all([
      fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).then(r => r.json()),
      getEmployeeEmails(),
    ]).then(([userJson, emailMap]) => {
      const info: Record<string, RequesterInfo> = {}
      for (const id of ids) {
        const email: string = userJson.emails?.[id] ?? ''
        const emp = emailMap[email]
        info[id] = { name: userJson.users?.[id] ?? email, email, position: emp?.position }
      }
      setRequesterInfo(info)
    })
  }, [open, isAdmin, pendingList])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const approve = async (id: string) => {
    await approveLicenseRequest(id, '')
    reload()
  }

  const reject = async (id: string) => {
    await rejectLicenseRequest(id)
    reload()
  }

  const badgeCount = isAdmin ? pendingCount : myUpdates.filter(r => r.status === 'approved' || r.status === 'rejected').length

  return (
    <>
      <div ref={ref} className="relative">
        <button onClick={() => setOpen(v => !v)}
          className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <Bell size={20} />
          {badgeCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                <Bell size={14} className="text-indigo-500" /> การแจ้งเตือน
              </p>
              {isAdmin && pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium rounded-full">
                  {pendingCount} รอดำเนินการ
                </span>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
              {isAdmin ? (
                pendingList.length === 0 ? (
                  <EmptyNoti />
                ) : pendingList.map(req => {
                  const info = requesterInfo[req.requested_by]
                  return (
                    <div key={req.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-amber-600">
                          {(info?.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                            {info?.name ?? '...'}
                          </p>
                          {info?.position && <p className="text-[10px] text-gray-500 dark:text-gray-400">{info.position}</p>}
                          {info?.email && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{info.email}</p>}
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                            <KeyRound size={9} />
                            ขอดู <span className="text-indigo-500 dark:text-indigo-400 font-medium">{req.asset_licenses?.name}</span>
                            <span className="ml-1">· {new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => approve(req.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                            <Check size={11} /> อนุมัติ
                          </button>
                          <button onClick={() => reject(req.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors">
                            <X size={11} /> ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                myUpdates.length === 0 ? (
                  <EmptyNoti />
                ) : myUpdates.map(req => (
                  <div key={req.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        req.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30' :
                        req.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30' :
                        'bg-amber-100 dark:bg-amber-900/30'
                      }`}>
                        {req.status === 'approved' ? <Check size={14} className="text-green-500" /> :
                         req.status === 'rejected' ? <X size={14} className="text-red-500" /> :
                         <Clock size={14} className="text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 dark:text-gray-200">
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">{req.asset_licenses?.name}</span>
                          {req.status === 'approved' && <span className="text-green-600 dark:text-green-400 ml-1">— ได้รับอนุมัติแล้ว</span>}
                          {req.status === 'rejected' && <span className="text-red-500 ml-1">— ถูกปฏิเสธ</span>}
                          {req.status === 'pending' && <span className="text-amber-500 ml-1">— รอการอนุมัติ</span>}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer — admin only */}
            {isAdmin && (
              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => { setOpen(false); router.push('/license-requests') }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  ดูทั้งหมด <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  )
}

function EmptyNoti() {
  return (
    <div className="py-10 text-center">
      <Bell size={24} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
      <p className="text-xs text-gray-400 dark:text-gray-500">ไม่มีการแจ้งเตือน</p>
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { role, userId } = useRole()
  const isAdmin = role === 'admin' || role === 'master_admin'

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Fixed Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"
          aria-label="เปิดเมนู"
        >
          <Menu size={22} />
        </button>

        <Link href="/" className="flex items-center gap-2 mr-auto">
          <Image src="/TT_LOGO_0.png" alt="Teethtalk" width={120} height={40} style={{ height: '2.5rem', width: 'auto' }} className="object-contain" />
          <span className="font-bold text-indigo-700 dark:text-indigo-400 text-lg hidden sm:block">IT Asset Teethtalk</span>
        </Link>

        <ThemeToggle />
        {(isAdmin || role === 'user') && <NotificationBell isAdmin={isAdmin} userId={userId ?? null} />}
        <UserMenu />
      </header>

      {/* Sidebar Drawer */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
