import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Stethoscope } from 'lucide-react'

// ─── Step map ─────────────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, path: '/',           label: 'Symptom'  },
  { num: 2, path: '/clarifying', label: 'Triage'   },
  { num: 3, path: '/results',    label: 'Diagnose' },
  { num: 4, path: '/escalation', label: 'Escalate' },
]

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar() {
  const location = useLocation()
  const navigate  = useNavigate()

  const currentIdx = STEPS.findIndex((s) => s.path === location.pathname)
  const activeStep = currentIdx === -1 ? 0 : currentIdx
  const canGoBack  = location.pathname !== '/'

  return (
    <nav
      className="relative flex items-center gap-3 px-4 sm:px-6 py-3.5
                 border-b border-white/6 z-30 shrink-0 sticky top-0"
      style={{
        // Animated gradient background
        background: 'linear-gradient(-45deg, #0B0F14 0%, #141A22 40%, #0d1627 70%, #0B0F14 100%)',
        backgroundSize: '400% 400%',
        animation: 'nav-shimmer 12s ease infinite',
      }}
    >
      {/* Subtle primary glow line at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-px
                      bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Floating blue orb — pure CSS, no perf hit */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2
                      w-48 h-12 rounded-full bg-primary/6 blur-2xl pointer-events-none" />

      {/* ── Left: back + logo ─────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 shrink-0">
        <AnimatePresence>
          {canGoBack && (
            <motion.button
              key="back"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="flex items-center justify-center w-8 h-8 rounded-lg
                         bg-white/6 hover:bg-white/12 transition-colors"
            >
              <ArrowLeft size={15} />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 text-primary">
            <Stethoscope size={14} strokeWidth={2.3} />
          </div>
          <span className="text-sm font-bold tracking-tight">
            Tech<span className="text-primary">Sense</span>
          </span>
        </div>
      </div>

      {/* ── Centre/Right: step indicator ──────────────────────────── */}
      <div className="ml-auto flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isDone   = i < activeStep
          const isActive = i === activeStep
          const isFuture = i > activeStep

          return (
            <div key={step.path} className="flex items-center">
              {/* Connector line between steps */}
              {i > 0 && (
                <div
                  className="w-5 sm:w-8 h-px transition-colors duration-500"
                  style={{
                    background: isDone
                      ? '#2ECC71'
                      : isActive
                        ? 'linear-gradient(90deg, #2ECC71, #1E5FFF)'
                        : 'rgba(255,255,255,0.08)',
                  }}
                />
              )}

              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <motion.div
                  layout
                  className="flex items-center justify-center w-7 h-7 rounded-full
                             text-xs font-bold transition-colors duration-300"
                  style={{
                    backgroundColor: isDone
                      ? '#2ECC71'
                      : isActive
                        ? '#1E5FFF'
                        : 'rgba(255,255,255,0.06)',
                    color: isDone || isActive ? '#fff' : 'rgba(255,255,255,0.25)',
                    animation: isActive ? 'step-pulse 2s ease-in-out infinite' : undefined,
                  }}
                >
                  {isDone ? (
                    <motion.svg
                      width="12" height="12" viewBox="0 0 12 12"
                      fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <path d="M2 6 L5 9 L10 3" />
                    </motion.svg>
                  ) : (
                    step.num
                  )}
                </motion.div>

                {/* Label — hidden on very small screens */}
                <span
                  className={[
                    'hidden sm:block text-[9px] font-semibold leading-none transition-colors duration-300',
                    isActive  ? 'text-foreground'    : '',
                    isDone    ? 'text-success/70'    : '',
                    isFuture  ? 'text-foreground/25' : '',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </nav>
  )
}

// ─── Page-transition wrapper ───────────────────────────────────────────────────
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex-1 flex flex-col min-h-0"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ─── Layout ────────────────────────────────────────────────────────────────────
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <NavBar />
      {/* Flex-1 so content fills remaining height; overflow-hidden so inner
          screens can manage their own scroll independently */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
