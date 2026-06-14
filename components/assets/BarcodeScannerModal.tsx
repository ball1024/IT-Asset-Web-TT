'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, CameraOff, RefreshCw } from 'lucide-react'

interface Props {
  target: 'asset_no' | 'serial_no'
  onResult: (value: string, target: 'asset_no' | 'serial_no') => void
  onClose: () => void
}

// Native BarcodeDetector (Chrome/Android hardware-accelerated)
type NativeBarcodeDetector = {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<Array<{ rawValue: string }>>
}
declare const BarcodeDetector: {
  new(options: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats?(): Promise<string[]>
}

const NATIVE_FORMATS = [
  'code_128', 'code_39', 'code_93',
  'qr_code', 'data_matrix', 'pdf417',
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'itf', 'codabar',
]

export default function BarcodeScannerModal({ target, onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const scannedRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)

  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [method, setMethod] = useState<'native' | 'zxing' | ''>('')

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const handleClose = useCallback(() => {
    stopAll()
    onClose()
  }, [stopAll, onClose])

  const startNativeScan = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return

    const detector = new BarcodeDetector({ formats: NATIVE_FORMATS })
    setMethod('native')
    setStatus('scanning')

    const tick = async () => {
      if (scannedRef.current || !videoRef.current) return
      try {
        const results = await detector.detect(videoRef.current)
        if (results.length > 0 && !scannedRef.current) {
          scannedRef.current = true
          stopAll()
          onResult(results[0].rawValue, target)
          onClose()
          return
        }
      } catch {
        // frame not ready yet — ลองใหม่
      }
      rafRef.current = requestAnimationFrame(() => { void tick() })
    }
    rafRef.current = requestAnimationFrame(() => { void tick() })
    void stream
  }, [stopAll, onResult, onClose, target])

  const startZxingScan = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current || !canvasRef.current) return

    const {
      MultiFormatReader, DecodeHintType, BarcodeFormat,
      HTMLCanvasElementLuminanceSource, HybridBinarizer, BinaryBitmap,
    } = await import('@zxing/library')

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
      BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.PDF_417,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader = new MultiFormatReader()
    reader.setHints(hints)
    setMethod('zxing')
    setStatus('scanning')

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    const tick = () => {
      if (scannedRef.current || !videoRef.current) return
      const v = videoRef.current
      if (v.readyState >= 2 && v.videoWidth > 0) {
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        ctx.drawImage(v, 0, 0)
        try {
          const lum = new HTMLCanvasElementLuminanceSource(canvas)
          const bitmap = new BinaryBitmap(new HybridBinarizer(lum))
          const result = reader.decode(bitmap)
          if (result && !scannedRef.current) {
            scannedRef.current = true
            stopAll()
            onResult(result.getText(), target)
            onClose()
            return
          }
        } catch {
          // ยังไม่เจอ
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    void stream
  }, [stopAll, onResult, onClose, target])

  useEffect(() => {
    let cancelled = false
    scannedRef.current = false

    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // ใช้ Native BarcodeDetector ถ้า browser รองรับ (Chrome Android)
        if (typeof BarcodeDetector !== 'undefined') {
          await startNativeScan(stream)
        } else {
          await startZxingScan(stream)
        }
      } catch (err: unknown) {
        if (cancelled) return
        const e = err as DOMException | Error
        let msg = 'ไม่สามารถเปิดกล้องได้'
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          msg = 'กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์'
        } else if (e.name === 'NotFoundError') {
          msg = 'ไม่พบกล้องบนอุปกรณ์นี้'
        } else if (e.name === 'NotReadableError') {
          msg = 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปอื่นแล้วลองใหม่'
        }
        setErrorMsg(msg)
        setStatus('error')
      }
    }

    void run()
    return () => {
      cancelled = true
      stopAll()
    }
  }, [retryCount, startNativeScan, startZxingScan, stopAll])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
        <div>
          <p className="text-white text-sm font-medium">
            สแกน {target === 'asset_no' ? 'Asset No. (QR Code)' : 'Serial No. (Barcode)'}
          </p>
          {method && (
            <p className="text-white/40 text-xs mt-0.5">
              {method === 'native' ? '⚡ Native detector' : '📦 ZXing fallback'}
            </p>
          )}
        </div>
        <button onClick={handleClose} className="text-white bg-white/20 p-2 rounded-full" aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay muted playsInline
        />
        {/* canvas สำหรับ ZXing fallback (ซ่อน) */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan guide */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {target === 'serial_no' ? (
              <div
                className="border-2 border-white rounded"
                style={{ width: '88%', height: '15%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
              />
            ) : (
              <div
                className="border-2 border-white rounded"
                style={{ width: '68%', aspectRatio: '1', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
              />
            )}
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <Loader2 size={40} className="text-white animate-spin" />
            <p className="text-white text-sm">กำลังเปิดกล้อง...</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4 px-8 text-center">
            <CameraOff size={48} className="text-red-400" />
            <p className="text-white text-base">{errorMsg}</p>
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-full text-sm font-medium"
            >
              <RefreshCw size={16} /> ลองใหม่
            </button>
            <button onClick={handleClose} className="text-white/60 text-sm underline">ปิด</button>
          </div>
        )}
      </div>

      {/* Hint */}
      {status === 'scanning' && (
        <div className="px-4 pb-safe-bottom pb-6 pt-3 text-center">
          <p className="text-white/60 text-xs">
            {target === 'serial_no'
              ? 'จัดบาร์โค้ดแนวนอนให้อยู่ในกรอบ · เข้าใกล้ให้บาร์โค้ดเต็มกรอบ'
              : 'จัด QR Code ให้อยู่กลางกรอบ'}
          </p>
        </div>
      )}
    </div>
  )
}
