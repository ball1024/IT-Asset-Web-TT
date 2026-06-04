export async function compressImage(file: File): Promise<File> {
  const MAX_SIZE = 200 * 1024
  const MAX_DIM = 1920

  const compress = async (blob: Blob, quality: number, width: number, height: number): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((b) => resolve(b!), 'image/webp', quality)
      }
      img.src = URL.createObjectURL(blob)
    })
  }

  const getDimensions = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.width, h: img.height })
      img.src = URL.createObjectURL(file)
    })

  let { w, h } = await getDimensions(file)
  let currentBlob: Blob = file

  while (true) {
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h)
      w = Math.floor(w * ratio)
      h = Math.floor(h * ratio)
    }

    let quality = 0.85
    let result = await compress(currentBlob, quality, w, h)

    while (result.size > MAX_SIZE && quality > 0.5) {
      quality -= 0.05
      result = await compress(currentBlob, quality, w, h)
    }

    if (result.size <= MAX_SIZE) {
      return new File([result], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' })
    }

    w = Math.floor(w * 0.5)
    h = Math.floor(h * 0.5)
    currentBlob = result
  }
}
