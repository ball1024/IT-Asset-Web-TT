'use client'
import { useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X } from 'lucide-react'

interface Props {
  target: 'asset_no' | 'serial_no'
  onResult: (value: string, target: 'asset_no' | 'serial_no') => void
  onClose: () => void
}

export default function BarcodeScannerModal({ target, onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannedRef = useRef(false) // ป้องกัน fire ซ้ำ

  useEffect(() => {
    scannedRef.current = false
    const reader = new BrowserMultiFormatReader()

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current!,
      (result) => {
        if (result && !scannedRef.current) {
          scannedRef.current = true
          try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
          onResult(result.getText(), target)
          onClose()
        }
      }
    ).catch(() => {})

    return () => {
      try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="absolute top-4 right-4">
        <button onClick={() => {
          try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
          onClose()
        }} className="text-white bg-black/50 p-2 rounded-full">
          <X size={24} />
        </button>
      </div>
      <p className="text-white text-sm absolute top-4 left-4">
        สแกน {target === 'asset_no' ? 'Asset No.' : 'Serial No.'}
      </p>
      <video ref={videoRef} className="w-full max-w-md aspect-video object-cover rounded-lg" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-32 border-2 border-white rounded-lg opacity-70" />
      </div>
    </div>
  )
}
