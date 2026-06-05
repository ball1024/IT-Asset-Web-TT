'use client'
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X, Loader2, CameraOff } from 'lucide-react'

interface Props {
  target: 'asset_no' | 'serial_no'
  onResult: (value: string, target: 'asset_no' | 'serial_no') => void
  onClose: () => void
}

export default function BarcodeScannerModal({ target, onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const handleClose = () => {
    try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
    onClose()
  }

  useEffect(() => {
    scannedRef.current = false
    const reader = new BrowserMultiFormatReader()

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }

    reader
      .decodeFromConstraints(constraints, videoRef.current!, (result, err) => {
        if (result && !scannedRef.current) {
          scannedRef.current = true
          try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
          onResult(result.getText(), target)
          onClose()
          return
        }
        // IgnoreNotFoundException — เกิดทุก frame ที่ยังไม่เจอบาร์โค้ด ไม่ใช่ error จริง
        if (err && err.name !== 'NotFoundException') {
          console.warn('[Scanner]', err)
        }
      })
      .then(() => {
        setStatus('scanning')
      })
      .catch((err: unknown) => {
        const e = err as DOMException | Error
        let msg = 'ไม่สามารถเปิดกล้องได้'
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          msg = 'กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์'
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          msg = 'ไม่พบกล้องบนอุปกรณ์นี้'
        } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          msg = 'กล้องกำลังถูกใช้งานโดยแอปอื่น'
        } else if (e.name === 'OverconstrainedError') {
          msg = 'กล้องไม่รองรับการตั้งค่าที่ต้องการ'
        }
        setErrorMsg(msg)
        setStatus('error')
      })

    return () => {
      try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Close button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleClose}
          className="text-white bg-black/50 p-2 rounded-full"
          aria-label="ปิด"
        >
          <X size={24} />
        </button>
      </div>

      {/* Label */}
      <p className="text-white text-sm absolute top-4 left-4 z-10">
        สแกน {target === 'asset_no' ? 'Asset No.' : 'Serial No.'}
      </p>

      {/* Video — playsInline สำคัญมากสำหรับ iOS */}
      <video
        ref={videoRef}
        className="w-full max-w-md aspect-video object-cover rounded-lg"
        playsInline
        autoPlay
        muted
      />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
          <Loader2 size={40} className="text-white animate-spin" />
          <p className="text-white text-sm">กำลังเปิดกล้อง...</p>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4 px-6 text-center">
          <CameraOff size={48} className="text-red-400" />
          <p className="text-white text-base font-medium">{errorMsg}</p>
          <button
            onClick={handleClose}
            className="mt-2 px-6 py-2 bg-white text-black rounded-full text-sm font-medium"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Scan guide frame */}
      {status === 'scanning' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-32 border-2 border-white rounded-lg opacity-70" />
        </div>
      )}
    </div>
  )
}
