'use client'
import AppShell from '@/components/layout/AppShell'
import AssetForm from '@/components/assets/AssetForm'
import ImportExcelModal from '@/components/assets/ImportExcelModal'
import { useRole } from '@/hooks/useRole'
import { canEdit } from '@/lib/permissions'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewAssetPage() {
  const { role, userId, loading } = useRole()
  const [showImport, setShowImport] = useState(false)
  const router = useRouter()

  if (loading) return (
    <AppShell><p className="text-gray-400 text-sm p-4">Loading...</p></AppShell>
  )

  if (!canEdit(role)) return (
    <AppShell><p className="text-gray-500 p-4">ไม่มีสิทธิ์เข้าถึงหน้านี้ (role: {role ?? 'ไม่พบ'})</p></AppShell>
  )

  return (
    <AppShell>
      {showImport && userId && (
        <ImportExcelModal type="assets" userId={userId} onDone={() => { setShowImport(false); router.push('/assets') }} onClose={() => setShowImport(false)} />
      )}
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Add Asset</h2>
          <button onClick={() => setShowImport(true)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Import Excel</button>
        </div>
        {userId && <AssetForm userId={userId} />}
      </div>
    </AppShell>
  )
}
