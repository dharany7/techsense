import { create } from 'zustand'

export type ToastKind = 'error' | 'warning' | 'info'

interface ToastState {
  message: string | null
  kind: ToastKind
  show: (msg: string, kind?: ToastKind) => void
  hide: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  kind: 'error',
  show: (message, kind = 'error') => set({ message, kind }),
  hide: () => set({ message: null }),
}))
