import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Stethoscope, Clock } from 'lucide-react'

interface ResultsState {
  symptom?: string
  answers?: Record<string, string>
  questionsAsked?: string[]
}

/** Placeholder — will be replaced with the full DiagnosisResultsScreen. */
export default function ResultsScreen() {
  const { state } = useLocation() as { state: ResultsState | null }
  const navigate = useNavigate()

  const { symptom, answers, questionsAsked } = state ?? {}

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 sticky top-0 bg-background/80 backdrop-blur z-10">
        <button
          onClick={() => navigate('/')}
          aria-label="Go back to home"
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/6 hover:bg-white/12 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
          <Stethoscope size={18} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">
            Tech<span className="text-primary">Sense</span>
          </p>
          <p className="text-xs text-foreground/40 mt-0.5">Results · Step 3 of 3</p>
        </div>
        {/* Progress */}
        <div className="ml-auto flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 w-5 rounded-full bg-success" />
          ))}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Clock size={28} className="text-primary" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">
            Coming next
          </p>
          <h1 className="text-2xl font-bold">Diagnosis Results</h1>
          <p className="text-foreground/45 text-sm max-w-sm leading-relaxed">
            This screen will display ranked diagnoses, confidence scores, and fix
            steps. For now it echoes the triage data it received.
          </p>
        </motion.div>

        {/* Debug: triage summary */}
        {symptom && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="w-full bg-surface border border-white/8 rounded-2xl p-5 space-y-4 text-sm"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/35 mb-1">
                Symptom reported
              </p>
              <p className="text-foreground/80 leading-relaxed">"{symptom}"</p>
            </div>

            {questionsAsked && questionsAsked.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/35 mb-2">
                  Questions answered
                </p>
                <ul className="space-y-1.5">
                  {questionsAsked.map((q, i) => (
                    <li key={i} className="text-foreground/60 flex gap-2">
                      <span className="text-primary/60 shrink-0">Q{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {answers && Object.keys(answers).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/35 mb-2">
                  Answers recorded
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.values(answers).map((ans, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-medium"
                    >
                      {ans}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Start new diagnosis
        </motion.button>
      </main>
    </div>
  )
}
