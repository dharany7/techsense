import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, ArrowRight, AlertCircle } from 'lucide-react'

// ─── Web Speech API types (not yet in lib.dom.d.ts for all browsers) ─────────
interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition
    webkitSpeechRecognition?: new () => ISpeechRecognition
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getSpeechRecognition(): (new () => ISpeechRecognition) | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigate = useNavigate()

  const [symptom, setSymptom] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechSupported] = useState(() => getSpeechRecognition() !== null)
  const [speechError, setSpeechError] = useState<string | null>(null)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Auto-grow textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [symptom])

  // ── Cleanup recognition on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  // ── Toggle voice recognition ──────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    setSpeechError(null)

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript
      }
      setSymptom(transcript)
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'aborted') {
        setSpeechError(
          e.error === 'not-allowed'
            ? 'Microphone access denied. Please allow microphone in browser settings.'
            : `Speech error: ${e.error}`,
        )
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }, [isListening])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const trimmed = symptom.trim()
    if (!trimmed) return
    recognitionRef.current?.stop()
    navigate('/clarifying', { state: { symptom: trimmed } })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit()
    }
  }

  const canSubmit = symptom.trim().length > 0

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-2xl flex flex-col gap-8"
        >
          {/* ── Title block ─────────────────────────────────────────────── */}
          <div className="text-center space-y-3">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.45 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none"
            >
              Tech{' '}
              <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                Sense
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.45 }}
              className="text-base sm:text-lg text-foreground/50 font-medium"
            >
              AI diagnostic copilot for field technicians
            </motion.p>
          </div>

          {/* ── Card ────────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.45 }}
            className="bg-surface border border-white/8 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5"
          >
            <label
              htmlFor="symptom-input"
              className="block text-sm font-semibold text-foreground/70 uppercase tracking-widest"
            >
              Describe the fault
            </label>

            {/* ── Textarea + mic row ──────────────────────────────────── */}
            <div className="relative">
              <textarea
                id="symptom-input"
                ref={textareaRef}
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
                placeholder='e.g. Elevator jerking on floor 3, error code E14'
                className={[
                  'w-full resize-none rounded-xl px-5 py-4 pr-16',
                  'bg-background border text-foreground text-base leading-relaxed',
                  'placeholder-foreground/25 font-medium',
                  'focus:outline-none focus:ring-2 focus:ring-primary/60',
                  'transition-colors duration-200',
                  isListening
                    ? 'border-danger/70 ring-2 ring-danger/30'
                    : 'border-white/10 hover:border-white/20',
                ].join(' ')}
                style={{ minHeight: '120px', overflow: 'hidden' }}
              />

              {/* ── Mic button ──────────────────────────────────────── */}
              <div className="absolute top-3 right-3">
                {speechSupported ? (
                  <button
                    id="mic-button"
                    type="button"
                    onClick={toggleListening}
                    aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                    className={[
                      'relative flex items-center justify-center',
                      'w-11 h-11 rounded-xl transition-all duration-200',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface',
                      isListening
                        ? 'bg-danger text-white focus:ring-danger hover:bg-danger/90'
                        : 'bg-white/8 text-foreground/60 hover:bg-white/14 hover:text-foreground focus:ring-primary/50',
                    ].join(' ')}
                  >
                    {isListening ? (
                      <>
                        {/* Pulsing ring */}
                        <span className="absolute inset-0 rounded-xl bg-danger/40 animate-ping" />
                        <MicOff size={18} strokeWidth={2.2} className="relative z-10" />
                      </>
                    ) : (
                      <Mic size={18} strokeWidth={2.2} />
                    )}
                  </button>
                ) : (
                  <div
                    title="Voice input not supported in this browser (use Chrome)"
                    className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/4 text-foreground/20 cursor-not-allowed"
                  >
                    <MicOff size={18} strokeWidth={2.2} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Live listening indicator ─────────────────────────── */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  key="listening-badge"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2.5 text-sm font-medium text-danger overflow-hidden"
                >
                  {/* Pulsing dot */}
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
                  </span>
                  Listening… speak your fault description
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Speech error ─────────────────────────────────────── */}
            <AnimatePresence>
              {speechError && (
                <motion.div
                  key="speech-error"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 rounded-lg bg-danger/10 border border-danger/25 px-4 py-3 text-sm text-danger"
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{speechError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Browser hint (non-Chrome) ────────────────────────── */}
            {!speechSupported && (
              <p className="text-xs text-foreground/30 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Voice input requires Chrome or Edge. Type your symptom instead.
              </p>
            )}

            {/* ── Submit button ────────────────────────────────────── */}
            <button
              id="start-diagnosis-btn"
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={[
                'w-full flex items-center justify-center gap-3',
                'py-4 px-6 rounded-xl text-base font-bold tracking-wide',
                'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-primary',
                canSubmit
                  ? 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-lg shadow-primary/30 cursor-pointer'
                  : 'bg-white/5 text-foreground/25 cursor-not-allowed',
              ].join(' ')}
            >
              Start Diagnosis
              <ArrowRight
                size={20}
                strokeWidth={2.5}
                className={`transition-transform duration-200 ${canSubmit ? 'translate-x-0 group-hover:translate-x-1' : ''}`}
              />
            </button>

            <p className="text-center text-xs text-foreground/25">
              Press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/8 font-mono text-foreground/40">
                Ctrl
              </kbd>{' '}
              +{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/8 font-mono text-foreground/40">
                Enter
              </kbd>{' '}
              to submit
            </p>
          </motion.div>
        </motion.div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="py-5 text-center text-xs text-foreground/20 border-t border-white/5">
        TechSense · AI-assisted, field-first diagnostics
      </footer>
    </div>
  )
}
