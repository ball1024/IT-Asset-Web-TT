import { Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import AssetsPageContent from './AssetsPageContent'

export default function AssetsPage() {
  return (
    <AppShell>
      <Suspense>
        <AssetsPageContent />
      </Suspense>
    </AppShell>
  )
}
