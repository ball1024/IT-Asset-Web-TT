import AppShell from '@/components/layout/AppShell'
import AssetDetailContent from './AssetDetailContent'

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <AppShell><AssetDetailContent paramsPromise={params} /></AppShell>
}
