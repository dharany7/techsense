import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Stethoscope } from 'lucide-react'
import { diagnosticService } from '../services'
import type { ClarifyingQuestion } from '../models'

// ─── Message model ────────────────────────────────────────────────────────────

type UserMessage = {
  id: string
  role: 'user'
  content: string
}

type QuestionMessage = {
  id: string
  role: 'assistant'
  kind: 'question'
  question: ClarifyingQuestion
  isAnswered: boolean
}

type TextMessage = {
  id: string
  role: 'assistant'
  kind: 'text'
  content: string
}

type ChatMessage = UserMessage | QuestionMessage | TextMessage

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _msgId = 0
const nextId = () => String(++_msgId)

function userMsg(content: string): UserMessage {
  return { id: nextId(), role: 'user', content }
}

function questionMsg(question: ClarifyingQuestion): QuestionMessage {
  return { id: nextId(), role: 'assistant', kind: 'question', question, isAnswered: false }
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      key="typing"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.25 }}
      className="flex items-end gap-2 self-start"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mb-1">
        <Stethoscope size={14} className="text-primary" strokeWidth={2.2} />
      </div>
      {/* Bubble */}
      <div className="bg-surface border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-2 h-2 rounded-full bg-foreground/40"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.7,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}

// ─── Message bubble variants ──────────────────────────────────────────────────

const bubbleVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,
    transition: { duration: 0.3, ease: 'easeOut' } },
}

// ─── User bubble ──────────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <motion.div
      variants={bubbleVariants}
      initial="hidden"
      animate="show"
      className="flex justify-end self-end max-w-[85%] sm:max-w-[72%]"
    >
      <div className="bg-primary text-white rounded-2xl rounded-br-sm px-5 py-3.5 text-sm leading-relaxed font-medium shadow-lg shadow-primary/20">
        {content}
      </div>
    </motion.div>
  )
}

// ─── Assistant question bubble ────────────────────────────────────────────────

function QuestionBubble({
  message,
  onAnswer,
}: {
  message: QuestionMessage
  onAnswer: (questionId: string, option: string) => void
}) {
  return (
    <motion.div
      variants={bubbleVariants}
      initial="hidden"
      animate="show"
      className="flex items-end gap-2 self-start max-w-[95%] sm:max-w-[80%]"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mb-1">
        <Stethoscope size={14} className="text-primary" strokeWidth={2.2} />
      </div>

      <div className="flex flex-col gap-3">
        {/* Question text */}
        <div className="bg-surface border border-white/8 rounded-2xl rounded-bl-sm px-5 py-3.5 text-sm leading-relaxed text-foreground">
          {message.question.questionText}
        </div>

        {/* Option chips */}
        <div className="flex flex-wrap gap-2 pl-1">
          {message.question.options.map((opt) => (
            <button
              key={opt}
              disabled={message.isAnswered}
              onClick={() => onAnswer(message.question.id, opt)}
              className={[
                'px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                message.isAnswered
                  ? 'border-white/5 text-foreground/25 bg-white/3 cursor-not-allowed'
                  : 'border-primary/40 text-primary bg-primary/8 hover:bg-primary/18 hover:border-primary/70 active:scale-95 cursor-pointer',
              ].join(' ')}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClarifyingQuestionsScreen() {
  const { state } = useLocation() as {
    state: { symptom?: string } | null
  }
  const navigate = useNavigate()

  const symptom = state?.symptom ?? ''

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [nextQIndex, setNextQIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Auto-scroll whenever messages or typing state changes ────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ── Initialise: show symptom bubble then fetch questions ─────────────────
  useEffect(() => {
    if (!symptom) {
      navigate('/', { replace: true })
      return
    }

    // 1. Show the technician's symptom as first message
    setMessages([userMsg(symptom)])

    // 2. After a brief pause, show typing indicator and fetch
    const timer = setTimeout(async () => {
      setIsTyping(true)
      try {
        const qs = await diagnosticService.getClarifyingQuestions(symptom)
        setQuestions(qs)
        setIsTyping(false)
        // 3. Push the first question
        setMessages((prev) => [...prev, questionMsg(qs[0])])
        setNextQIndex(1)
      } catch {
        setIsTyping(false)
      }
    }, 400)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handle chip tap ───────────────────────────────────────────────────────
  const handleAnswer = useCallback(
    (questionId: string, option: string) => {
      // Mark the question bubble as answered (disables chips)
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'assistant' && m.kind === 'question' && m.question.id === questionId
            ? { ...m, isAnswered: true }
            : m,
        ),
      )

      // Record the answer
      const newAnswers = { ...answers, [questionId]: option }
      setAnswers(newAnswers)

      // Append the user's answer bubble
      setMessages((prev) => [...prev, userMsg(option)])

      if (nextQIndex < questions.length) {
        // More questions — show typing then the next one
        const queuedIndex = nextQIndex
        setNextQIndex((i) => i + 1)

        setTimeout(() => {
          setIsTyping(true)
          setTimeout(() => {
            setIsTyping(false)
            setMessages((prev) => [...prev, questionMsg(questions[queuedIndex])])
          }, 900)
        }, 300)
      } else {
        // All answered — navigate to results
        setTimeout(() => {
          navigate('/results', {
            state: {
              symptom,
              answers: newAnswers,
              questionsAsked: questions.map((q) => q.questionText),
            },
          })
        }, 500)
      }
    },
    [answers, nextQIndex, questions, navigate, symptom],
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">

          {/* Date / context pill */}
          <div className="text-center">
            <span className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/8 text-xs text-foreground/35 font-medium">
              Diagnostic session started
            </span>
          </div>

          {/* Messages */}
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return <UserBubble key={msg.id} content={msg.content} />
              }
              if (msg.role === 'assistant' && msg.kind === 'question') {
                return (
                  <QuestionBubble
                    key={msg.id}
                    message={msg}
                    onAnswer={handleAnswer}
                  />
                )
              }
              return null
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>{isTyping && <TypingIndicator />}</AnimatePresence>

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-4" />
        </div>
      </main>

      {/* ── Bottom hint ─────────────────────────────────────────────────── */}
      <footer className="shrink-0 px-6 py-4 border-t border-white/5 text-center text-xs text-foreground/25">
        Tap an option to answer · AI-assisted, field-first diagnostics
      </footer>
    </div>
  )
}
