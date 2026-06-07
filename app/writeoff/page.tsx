import { Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import WriteoffContent from './WriteoffContent'

export default function WriteoffPage() {
  return (
    <AppShell>
      <Suspense>
        <WriteoffContent />
      </Suspense>
    </AppShell>
  )
}
