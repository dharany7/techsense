import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { useToastStore } from '../stores/toastStore'

/**
 * Global error/info banner.
 * Mount once inside Layout — it reads from the Zustand toast store and
 * auto-dismisses after 6 seconds.  The user can also dismiss manually.
 */
export default function Toast() {
  const { message, kind, hide } = useToastStore()

  // Auto-dismiss after 6 s whenever a new message appears
  useEffect(() => {
    if (!message) return
    const t = setTimeout(hide, 6000)
    return () => clearTimeout(t)
  }, [message, hide])

  const bg =
    kind === 'error'
      ? 'bg-danger/95 border-danger/40'
      : kind === 'warning'
        ? 'bg-warning/95 border-warning/40'
        : 'bg-primary/95 border-primary/40'

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key="toast"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="alert"
          className={[
            'fixed top-[60px] left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-md',
            'text-white text-sm font-semibold shadow-xl',
            'max-w-[min(90vw,480px)] w-full',
            bg,
          ].join(' ')}
        >
          <AlertTriangle size={16} className="shrink-0 opacity-90" />
          <span className="flex-1 leading-snug">{message}</span>
          <button
            onClick={hide}
            aria-label="Dismiss"
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
