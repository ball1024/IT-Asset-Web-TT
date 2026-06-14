'use client'
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library'
import { X, Loader2, CameraOff, RefreshCw } from 'lucide-react'

interface Props {
  target: 'asset_no' | 'serial_no'
  onResult: (value: string, target: 'asset_no' | 'serial_no') => void
  onClose: () => void
}

const HINTS = new Map()
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.PDF_417,
])
HINTS.set(DecodeHintType.TRY_HARDER, true)

export default function BarcodeScannerModal({ target, onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const scannedRef = useRef(false)

  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  const stopScanner = () => {
    readerRef.current?.reset()
    readerRef.current = null
  }

  const handleClose = () => {
    stopScanner()
    onClose()
  }

  const startScanner = async () => {
    setStatus('loading')
    setErrorMsg('')
    scannedRef.current = false
    stopScanner()

    if (!videoRef.current) return

    try {
      const reader = new BrowserMultiFormatReader(HINTS, 100)
      readerRef.current = reader

      await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current,
        (result, err) => {
          if (result && !scannedRef.current) {
            scannedRef.current = true
            stopScanner()
            onResult(result.getText(), target)
            onClose()
          }
          // err คือ "ยังไม่เจอ" ปกติ ไม่ต้องทำอะไร
          void err
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

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />

        {/* Scan guide overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {target === 'serial_no' ? (
              <div
                className="border-2 border-white rounded"
                style={{
                  width: '88%',
                  height: '15%',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                }}
              />
            ) : (
              <div
                className="border-2 border-white rounded"
                style={{
                  width: '68%',
                  aspectRatio: '1',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                }}
              />
            )}
          </div>
        )}

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
            <button onClick={handleClose} className="text-white/60 text-sm underline">
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
              ? 'จัดบาร์โค้ดแนวนอนให้อยู่ในกรอบ · เข้าใกล้ให้บาร์โค้ดเต็มกรอบ'
              : 'จัด QR Code ให้อยู่กลางกรอบ'}
          </p>
        </div>
      )}
    </div>
  )
}
