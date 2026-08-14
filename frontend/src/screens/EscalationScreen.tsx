import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, CheckCircle2, Stethoscope,
  MessageSquareText, ListChecks, Target, StickyNote, User,
} from 'lucide-react'
import { diagnosticService } from '../services'
import type { EscalationContext } from '../services'
import type { EscalationBrief } from '../models'

// ─── Router state ─────────────────────────────────────────────────────────────
interface LocationState {
  symptom?: string
  questionsAsked?: string[]
  topDiagnosis?: string
  confidenceScore?: number
  /** Full DiagnosisResult object forwarded from DiagnosisResultsScreen */
  topDiagnosisResult?: import('../models/types').DiagnosisResult
}

// ─── Expert name (hardcoded for mock) ────────────────────────────────────────
const EXPERT_NAME = 'Sarah Mitchell'
const COUNTDOWN_START = 9   // seconds of dramatic countdown

// ─────────────────────────────────────────────────────────────────────────────
// Animated checkmark SVG
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedCheck() {
  return (
    <motion.svg
      width="28" height="28" viewBox="0 0 28 28"
      fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      stroke="white"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <motion.path
        d="M5 14 L11 20 L23 8"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeInOut', delay: 0.1 }}
      />
    </motion.svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Spinning progress ring for the loading state
// ─────────────────────────────────────────────────────────────────────────────
function ProgressRing({ pct }: { pct: number }) {
  const r = 36, sw = 5
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  const size = r * 2 + sw * 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#1E5FFF" strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={circ}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only info row in the brief card
// ─────────────────────────────────────────────────────────────────────────────
function BriefRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-foreground/35">
        <span className="text-foreground/25">{icon}</span>
        {label}
      </div>
      <div className="pl-0">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function EscalationScreen() {
  const { state } = useLocation() as { state: LocationState | null }
  const navigate = useNavigate()

  // ── Countdown (dramatic: 9 → 0) ─────────────────────────────────────────
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const countdownDone = countdown <= 0

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // ── Brief fetch ──────────────────────────────────────────────────────────
  const [brief, setBrief] = useState<EscalationBrief | null>(null)
  const [fetchDone, setFetchDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Build context for the real service.
    // topDiagnosisResult is the full DiagnosisResult forwarded by the results screen.
    const topResult = state?.topDiagnosisResult

    const ctx: EscalationContext = {
      symptom: state?.symptom ?? '',
      questionsAsked: state?.questionsAsked ?? [],
      topDiagnosis: topResult ?? {
        rank: 1,
        causeTitle: state?.topDiagnosis ?? 'Unknown',
        confidencePercent: state?.confidenceScore ?? 0,
        fixSteps: [],
        requiredParts: [],
      },
    }

    diagnosticService.generateEscalationBrief(ctx).then((b) => {
      if (!cancelled) { setBrief(b); setFetchDone(true) }
    }).catch(() => {
      if (!cancelled) setFetchDone(true)
    })
    return () => { cancelled = true }
  }, [])

  // Brief is "ready" when BOTH the fetch finished AND countdown hit 0
  const isReady = fetchDone && countdownDone

  // ── Technician notes (editable) ──────────────────────────────────────────
  const [notes, setNotes] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Pre-fill notes from brief once available
  useEffect(() => {
    if (brief && !notes) setNotes(brief.technicianNotes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief])

  // Auto-grow textarea
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [notes])

  // ── Send state ───────────────────────────────────────────────────────────
  const [sent, setSent] = useState(false)

  const handleSend = () => {
    if (sent) return
    setSent(true)
  }

  // ── Progress pct: maps countdown to 0–100 ────────────────────────────────
  const progressPct = Math.round(((COUNTDOWN_START - countdown) / COUNTDOWN_START) * 100)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* ── Loading / Countdown block ──────────────────────────────── */}
          <AnimatePresence mode="wait">
            {!isReady ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center gap-6 py-10"
              >
                {/* Ring */}
                <div className="relative flex items-center justify-center">
                  <ProgressRing pct={progressPct} />
                  {/* Countdown number in centre */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={countdown}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.3 }}
                        transition={{ duration: 0.25 }}
                        className="text-3xl font-extrabold text-foreground tabular-nums"
                      >
                        {countdown}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Label */}
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {countdown > 0
                      ? `Brief ready in ${countdown}s`
                      : 'Finalising…'}
                  </p>
                  <p className="text-sm text-foreground/45">
                    Drafting expert escalation brief…
                  </p>
                </div>

                {/* Shimmer skeleton rows */}
                <div className="w-full space-y-3 animate-pulse">
                  {[0.9, 0.7, 0.55].map((w, i) => (
                    <div key={i} className="h-3 rounded-lg bg-white/8" style={{ width: `${w * 100}%` }} />
                  ))}
                </div>
              </motion.div>
            ) : (

              /* ── Brief card ───────────────────────────────────────── */
              <motion.div
                key="brief"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="space-y-5"
              >
                {/* Heading */}
                <div>
                  <h1 className="text-xl font-bold">Expert Escalation Brief</h1>
                  <p className="text-sm text-foreground/45 mt-1">
                    Auto-generated in&nbsp;
                    <span className="text-success font-semibold">{COUNTDOWN_START}s</span>
                    &nbsp;· Review and send to a remote expert.
                  </p>
                </div>

                {/* Card */}
                <div className="bg-surface border border-white/8 rounded-2xl divide-y divide-white/5 overflow-hidden">

                  {/* Symptom summary */}
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    <BriefRow icon={<MessageSquareText size={13} />} label="Symptom summary">
                      <p className="text-sm text-foreground/75 leading-relaxed">
                        {brief?.symptomSummary ?? state?.symptom}
                      </p>
                    </BriefRow>
                  </div>

                  {/* Questions asked */}
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    <BriefRow icon={<ListChecks size={13} />} label="Questions asked">
                      <ul className="space-y-1.5">
                        {(brief?.questionsAsked ?? state?.questionsAsked ?? []).map((q, i) => (
                          <li key={i} className="flex gap-2 text-sm text-foreground/65">
                            <span className="text-primary/50 shrink-0 font-semibold">Q{i + 1}.</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </BriefRow>
                  </div>

                  {/* Top diagnosis + confidence */}
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    <BriefRow icon={<Target size={13} />} label="Top diagnosis">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          {brief?.topDiagnosis ?? state?.topDiagnosis}
                        </p>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold
                                         bg-warning/15 border border-warning/30 text-warning">
                          {brief?.confidenceScore ?? state?.confidenceScore}% confidence
                        </span>
                      </div>
                    </BriefRow>
                  </div>

                  {/* Technician notes — editable */}
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    <BriefRow icon={<StickyNote size={13} />} label="Technician notes (editable)">
                      <textarea
                        ref={notesRef}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={sent}
                        rows={3}
                        placeholder="Add any additional observations before sending…"
                        className={[
                          'w-full resize-none rounded-xl px-4 py-3 mt-1',
                          'bg-background border text-sm text-foreground leading-relaxed',
                          'placeholder-foreground/25 font-medium',
                          'focus:outline-none focus:ring-2 focus:ring-primary/50',
                          'transition-colors duration-200',
                          sent
                            ? 'border-white/5 text-foreground/40 cursor-not-allowed'
                            : 'border-white/10 hover:border-white/20',
                        ].join(' ')}
                        style={{ overflow: 'hidden', minHeight: '80px' }}
                      />
                    </BriefRow>
                  </div>
                </div>

                {/* Expert recipient preview */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/4 border border-white/7">
                  <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30
                                   flex items-center justify-center shrink-0 text-primary">
                    <User size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{EXPERT_NAME}</p>
                    <p className="text-xs text-foreground/40">Senior Elevator Technician · Remote</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-xs text-success font-medium">Online</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── Persistent bottom CTA ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/8
                      bg-background/95 backdrop-blur-md px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            {!isReady ? (
              /* ── Disabled ghost while loading ─── */
              <motion.button
                key="loading-btn"
                disabled
                className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl
                           bg-white/5 text-foreground/25 font-bold text-base cursor-not-allowed"
              >
                <Clock size={20} className="animate-spin opacity-50" />
                Preparing brief…
              </motion.button>
            ) : !sent ? (
              /* ── Send button ─────────────────── */
              <motion.button
                key="send-btn"
                id="send-expert-btn"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                onClick={handleSend}
                className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl
                           bg-primary text-white font-bold text-base
                           hover:bg-primary/90 active:scale-[0.98] transition-all
                           shadow-lg shadow-primary/30
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary"
              >
                <Stethoscope size={20} strokeWidth={2.2} />
                Send to Remote Expert
              </motion.button>
            ) : (
              /* ── Success state ───────────────── */
              <motion.div
                key="sent-state"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="w-full flex flex-col items-center gap-3"
              >
                <div className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl
                                bg-success text-white font-bold text-base
                                shadow-lg shadow-success/30">
                  <AnimatedCheck />
                  Sent to {EXPERT_NAME}
                </div>

                {/* Confirmation sub-line */}
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.3 }}
                  className="text-xs text-foreground/40 text-center"
                >
                  {EXPERT_NAME} has been notified and will respond shortly.
                </motion.p>

                {/* Return home */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  onClick={() => navigate('/')}
                  className="text-sm text-foreground/45 hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Return to home
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
