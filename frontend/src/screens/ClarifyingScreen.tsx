import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Stethoscope } from 'lucide-react'

/** Placeholder — will be fully built in the next sprint. */
export default function ClarifyingScreen() {
  const { state } = useLocation() as { state: { symptom?: string } | null }
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/6 hover:bg-white/12 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
          <Stethoscope size={18} strokeWidth={2.2} />
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground/80">
          Tech<span className="text-primary">Sense</span>
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary/70">
          Step 2 — Clarifying Questions
        </p>
        <h1 className="text-2xl font-bold">Clarifying Screen</h1>
        <p className="text-foreground/50 text-sm max-w-sm">
          This screen will be built next. Symptom received:
        </p>
        {state?.symptom && (
          <div className="bg-surface border border-white/8 rounded-xl px-6 py-4 text-sm text-foreground/70 max-w-md">
            "{state.symptom}"
          </div>
        )}
      </main>
    </div>
  )
}
