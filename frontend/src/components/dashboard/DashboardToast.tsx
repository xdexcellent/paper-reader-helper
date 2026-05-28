/**
 * Lightweight toast notification system for the dashboard.
 * Uses a simple event-based approach without external dependencies.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
  id: number
  text: string
  type: ToastType
}

let toastId = 0
const listeners = new Set<(msg: ToastMessage) => void>()

export function showToast(text: string, type: ToastType = 'success') {
  const msg: ToastMessage = { id: ++toastId, text, type }
  listeners.forEach(fn => fn(msg))
}

export function DashboardToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id))
      }, 3000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg transition-all animate-in slide-in-from-bottom-2 ${
            toast.type === 'success' ? 'bg-white text-[#10B981] border border-emerald-100' :
            toast.type === 'error' ? 'bg-white text-[#EF4444] border border-red-100' :
            'bg-white text-[#2563EB] border border-blue-100'
          }`}
          style={{ boxShadow: '0 8px 30px rgba(15,23,42,0.1)' }}
        >
          {toast.type === 'success' && <CheckCircle2 size={16} />}
          {toast.type === 'error' && <AlertCircle size={16} />}
          {toast.type === 'info' && <AlertCircle size={16} />}
          <span>{toast.text}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="ml-2 text-[#94A3B8] hover:text-[#64748B]"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
