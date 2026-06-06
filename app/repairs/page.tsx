import { Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import RepairsContent from './RepairsContent'

export default function RepairsPage() {
  return (
    <AppShell>
      <Suspense>
        <RepairsContent />
      </Suspense>
    </AppShell>
  )
}
