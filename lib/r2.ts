export function r2PublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''
  return `${base}/${key}`
}

export function assetImageKey(assetNo: string, index: number): string {
  return `assets/${assetNo}/${assetNo}_${index}.webp`
}

export async function getNextImageIndex(existingKeys: string[]): Promise<number> {
  if (!existingKeys.length) return 1
  const indices = existingKeys.map((k) => {
    const m = k.match(/_(\d+)\.webp$/)
    return m ? parseInt(m[1]) : 0
  })
  return Math.max(...indices) + 1
}
