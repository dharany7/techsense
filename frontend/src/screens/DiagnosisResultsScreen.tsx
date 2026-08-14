import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Package, Wrench,
} from 'lucide-react'
import { diagnosticService } from '../services'
import type { DiagnosisResult } from '../models'

// ─── Router state ──────────────────────────────────────────────────────────────
interface LocationState {
  symptom?: string
  answers?: Record<string, string>
  questionsAsked?: string[]
  questions?: import('../models/types').ClarifyingQuestion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence gauge — SVG ring that fills proportionally
// ─────────────────────────────────────────────────────────────────────────────
const RADIUS = 30
const STROKE = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function confidenceColor(pct: number) {
  if (pct > 75) return '#2ECC71'   // success green
  if (pct >= 50) return '#F5A623'  // warning amber
  return '#E74C3C'                  // danger red
}

function ConfidenceGauge({ percent }: { percent: number }) {
  const color = confidenceColor(percent)
  const offset = CIRCUMFERENCE * (1 - percent / 100)
  const size = RADIUS * 2 + STROKE * 2

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-label={`Confidence: ${percent}%`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={STROKE}
        />
        {/* Arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <span className="text-xs font-bold leading-none" style={{ color }}>
        {percent}%
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={[
        'rounded-2xl p-5 sm:p-6 border animate-pulse',
        featured
          ? 'bg-surface border-primary/20 shadow-lg shadow-primary/10'
          : 'bg-surface/60 border-white/5',
      ].join(' ')}
    >
      <div className="flex items-start gap-4">
        {/* Gauge placeholder */}
        <div className="w-16 h-16 rounded-full bg-white/8 shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          {/* Rank badge */}
          <div className="h-3 w-14 rounded-full bg-white/8" />
          {/* Title */}
          <div className="h-5 w-3/4 rounded-lg bg-white/10" />
          {/* Parts row */}
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-20 rounded-full bg-white/6" />
            <div className="h-5 w-24 rounded-full bg-white/6" />
          </div>
        </div>
      </div>
      {/* Steps placeholder */}
      <div className="mt-4 space-y-2 pl-20">
        <div className="h-3 w-full rounded bg-white/6" />
        <div className="h-3 w-5/6 rounded bg-white/6" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis card
// ─────────────────────────────────────────────────────────────────────────────
function DiagnosisCard({
  result,
  featured,
  index,
}: {
  result: DiagnosisResult
  featured: boolean
  index: number
}) {
  const [expanded, setExpanded] = useState(featured)
  const color = confidenceColor(result.confidencePercent)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      className={[
        'rounded-2xl border transition-shadow duration-300',
        featured
          ? 'bg-surface border-primary/35 shadow-xl shadow-primary/10 scale-[1.015]'
          : 'bg-surface/70 border-white/6 hover:border-white/12',
      ].join(' ')}
    >
      {/* ── Top row ────────────────────────────────────────────────── */}
      <div className="p-5 sm:p-6">
        {/* Rank + featured badge */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border"
            style={{
              color,
              borderColor: color + '40',
              backgroundColor: color + '15',
            }}
          >
            #{result.rank} {featured ? '· Most Likely' : ''}
          </span>
        </div>

        <div className="flex items-start gap-4">
          {/* Gauge */}
          <ConfidenceGauge percent={result.confidencePercent} />

          {/* Title + parts */}
          <div className="flex-1 min-w-0">
            <h2
              className={[
                'font-bold leading-snug text-foreground',
                featured ? 'text-xl sm:text-2xl' : 'text-lg',
              ].join(' ')}
            >
              {result.causeTitle}
            </h2>

            {/* Required parts */}
            {result.requiredParts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Package size={12} className="text-foreground/30 mt-0.5 shrink-0" />
                {result.requiredParts.map((part) => (
                  <span
                    key={part}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-white/6 border border-white/8 text-foreground/55 font-medium"
                  >
                    {part}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Fix steps toggle ──────────────────────────────────── */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 w-full flex items-center justify-between gap-2
                     px-4 py-2.5 rounded-xl bg-white/4 hover:bg-white/8
                     border border-white/6 hover:border-white/12
                     text-sm font-semibold text-foreground/70 hover:text-foreground
                     transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-expanded={expanded}
        >
          <span className="flex items-center gap-2">
            <Wrench size={14} className="text-foreground/40" />
            Fix steps ({result.fixSteps.length})
          </span>
          {expanded
            ? <ChevronUp size={16} className="text-foreground/40" />
            : <ChevronDown size={16} className="text-foreground/40" />}
        </button>
      </div>

      {/* ── Expandable steps ───────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <ol className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-2.5 border-t border-white/5 pt-4">
              {result.fixSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/70">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center
                               text-xs font-bold mt-0.5"
                    style={{ backgroundColor: color + '20', color }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function DiagnosisResultsScreen() {
  const { state } = useLocation() as { state: LocationState | null }
  const navigate = useNavigate()

  const answers = state?.answers ?? {}

  const [results, setResults] = useState<DiagnosisResult[]>([])
  const [loading, setLoading] = useState(true)

  // ── Fetch diagnosis ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    // Pass symptom so the real service can POST it to /symptoms/diagnose
    diagnosticService.getDiagnosis(answers, state?.symptom ?? '').then((res) => {
      if (!cancelled) {
        setResults(res.sort((a, b) => a.rank - b.rank))
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const top = results[0]
  const topConfidence = top?.confidencePercent ?? 0
  const escalate = topConfidence < 70

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

          {/* Section heading */}
          <div className="mb-2">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="text-xl font-bold"
            >
              {loading ? 'Analysing fault…' : 'Probable root causes'}
            </motion.h1>
            {!loading && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-sm text-foreground/45 mt-1"
              >
                {results.length} ranked diagnoses · tap a card to expand fix steps
              </motion.p>
            )}
          </div>

          {/* Skeletons */}
          {loading && (
            <>
              <SkeletonCard featured />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {/* Result cards */}
          {!loading && results.map((r, i) => (
            <DiagnosisCard
              key={r.rank}
              result={r}
              featured={i === 0}
              index={i}
            />
          ))}
        </div>
      </main>

      {/* ── Persistent bottom banner ──────────────────────────────────── */}
      <AnimatePresence>
        {!loading && (
          <motion.div
            key="banner"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-20
                       border-t border-white/8 bg-background/95 backdrop-blur-md
                       px-4 sm:px-6 py-4"
          >
            <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-start sm:items-center
                            justify-between gap-3">
              {escalate ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-danger leading-tight">
                        Confidence too low — escalate to expert
                      </p>
                      <p className="text-xs text-foreground/45 mt-0.5">
                        Top result is only {topConfidence}% confident. Senior review recommended.
                      </p>
                    </div>
                  </div>
                  <button
                    id="escalate-btn"
                    onClick={() =>
                      navigate('/escalation', {
                        state: {
                          symptom: state?.symptom,
                          questionsAsked: state?.questionsAsked,
                          // Pass the full top result object so EscalationScreen
                          // can forward it to generateEscalationBrief
                          topDiagnosisResult: top,
                          topDiagnosis: top?.causeTitle,
                          confidenceScore: topConfidence,
                        },
                      })
                    }
                    className="shrink-0 px-5 py-2.5 rounded-xl bg-danger text-white font-bold text-sm
                               hover:bg-danger/90 active:scale-95 transition-all
                               shadow-lg shadow-danger/25 focus:outline-none focus:ring-2 focus:ring-danger/50"
                  >
                    Escalate Now
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-success leading-tight">
                        High confidence — ready to resolve
                      </p>
                      <p className="text-xs text-foreground/45 mt-0.5">
                        Follow the fix steps for <span className="text-foreground/70">{top?.causeTitle}</span>.
                      </p>
                    </div>
                  </div>
                  <button
                    id="resolve-btn"
                    onClick={() => navigate('/')}
                    className="shrink-0 px-5 py-2.5 rounded-xl bg-success text-white font-bold text-sm
                               hover:bg-success/90 active:scale-95 transition-all
                               shadow-lg shadow-success/25 focus:outline-none focus:ring-2 focus:ring-success/50"
                  >
                    Mark as Resolved
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
