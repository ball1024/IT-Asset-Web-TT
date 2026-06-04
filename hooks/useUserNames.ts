'use client'
import { useEffect, useState } from 'react'

export function useUserNames(ids: (string | undefined | null)[]) {
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const unique = [...new Set(ids.filter(Boolean))] as string[]
    if (!unique.length) return

    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unique }),
    })
      .then(r => r.json())
      .then(data => setNames(data))
      .catch(() => {})
  }, [ids.filter(Boolean).sort().join(',')])

  return names
}
