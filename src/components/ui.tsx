import React, { createContext, useCallback, useContext, useState } from 'react'
import { Check, ChevronLeft, Pencil, Plus } from 'lucide-react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('')
  const show = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(''), 2300)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

export function IconBtn({ children, onClick, plain, title }: { children: React.ReactNode; onClick?: () => void; plain?: boolean; title?: string }) {
  return (
    <button className={`nav-btn${plain ? ' plain' : ''}`} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  )
}

export function EditBtn({ onClick }: { onClick?: () => void }) {
  return <IconBtn onClick={onClick}><Pencil size={16} /></IconBtn>
}

export function BackBtn({ onClick, label }: { onClick?: () => void; label?: string }) {
  return <button className="nav-back" onClick={onClick}><ChevronLeft size={22} />{label}</button>
}

export function AddBtn({ onClick }: { onClick?: () => void }) {
  return <IconBtn onClick={onClick}><Plus size={20} /></IconBtn>
}

export function CheckMark() {
  return <Check size={18} strokeWidth={3} />
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-label="开关"><i /></button>
}

export function StatusBar() {
  const native = Boolean((window as any).Capacitor?.isNativePlatform?.())
  return (
    <div className="statusbar">
      <span>19:34</span>
      <span className="sb-right">▮▮▮ ◔ <span style={{ fontSize: 11 }}>58</span>▣</span>
      {native && <style>{'.statusbar{display:none}'}</style>}
    </div>
  )
}
