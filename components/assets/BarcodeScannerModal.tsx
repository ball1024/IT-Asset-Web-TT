'use client'
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { X, Loader2, CameraOff, RefreshCw } from 'lucide-react'

interface Props {
  target: 'asset_no' | 'serial_no'
  onResult: (value: string, target: 'asset_no' | 'serial_no') => void
  onClose: () => void
}

const SCAN_FORMATS = [
  // QR & 2D
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  // 1D Barcodes
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
]

const SCANNER_ID = 'html5qr-scanner-region'

export default function BarcodeScannerModal({ target, onResult, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch {}
      scannerRef.current = null
    }
  }

  const handleClose = async () => {
    await stopScanner()
    onClose()
  }

  const startScanner = async () => {
    setStatus('loading')
    setErrorMsg('')
    scannedRef.current = false

    await stopScanner()

    // รอให้ DOM พร้อม
    await new Promise(r => setTimeout(r, 100))

    const scanner = new Html5Qrcode(SCANNER_ID, {
      formatsToSupport: SCAN_FORMATS,
      verbose: false,
    })
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 25,
          qrbox: (w, h) => {
            if (target === 'serial_no') {
              // barcode แนวนอนบน label → กรอบกว้างมาก สูงน้อย
              const bWidth  = Math.floor(Math.min(w, h) * 0.92)
              const bHeight = Math.floor(bWidth * 0.28)
              return { width: bWidth, height: bHeight }
            }
            // QR Code / Asset No. → กรอบสี่เหลี่ยมจัตุรัส
            const size = Math.floor(Math.min(w, h) * 0.72)
            return { width: size, height: size }
          },
          disableFlip: false,
        },
        (decodedText) => {
          if (scannedRef.current) return
          scannedRef.current = true
          stopScanner().then(() => {
            onResult(decodedText, target)
            onClose()
          })
        },
        () => {
          // scan ยังไม่เจอ — ปกติ ไม่ต้องทำอะไร
        }
      )
      setStatus('scanning')
    } catch (err: unknown) {
      const e = err as DOMException | Error
      let msg = 'ไม่สามารถเปิดกล้องได้'
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์'
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'ไม่พบกล้องบนอุปกรณ์นี้'
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        msg = 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปอื่นแล้วลองใหม่'
      }
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  useEffect(() => {
    startScanner()
    return () => { stopScanner() }
  }, [retryCount]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
        <p className="text-white text-sm font-medium">
          สแกน {target === 'asset_no' ? 'Asset No. (QR Code)' : 'Serial No. (Barcode)'}
        </p>
        <button
          onClick={handleClose}
          className="text-white bg-white/20 p-2 rounded-full"
          aria-label="ปิด"
        >
          <X size={20} />
        </button>
      </div>

      {/* Scanner area — html5-qrcode จะ inject video เข้า div นี้ */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <div
          id={SCANNER_ID}
          className="w-full max-w-lg"
          style={{ minHeight: 300 }}
        />

        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <Loader2 size={40} className="text-white animate-spin" />
            <p className="text-white text-sm">กำลังเปิดกล้อง...</p>
          </div>
        )}

        {/* Error overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4 px-8 text-center">
            <CameraOff size={48} className="text-red-400" />
            <p className="text-white text-base">{errorMsg}</p>
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-full text-sm font-medium"
            >
              <RefreshCw size={16} />
              ลองใหม่
            </button>
            <button
              onClick={handleClose}
              className="text-white/60 text-sm underline"
            >
              ปิด
            </button>
          </div>
        )}
      </div>

      {/* Hint */}
      {status === 'scanning' && (
        <div className="px-4 pb-safe-bottom pb-6 pt-3 text-center">
          <p className="text-white/60 text-xs">
            {target === 'serial_no'
              ? 'จัดบาร์โค้ดแนวนอนให้อยู่กลางกรอบ · เข้าใกล้ให้พอดี'
              : 'จัด QR Code ให้อยู่กลางกรอบ'}
          </p>
        </div>
      )}
    </div>
  )
}
