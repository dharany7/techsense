import type {
  ClarifyingQuestion,
  DiagnosisResult,
  EscalationBrief,
} from '../models/types'
import { useToastStore } from '../stores/toastStore'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All fetch calls use `/api/…` so the Vite dev-server proxy can forward them
 * to http://localhost:8000 without CORS issues.  In production, configure your
 * reverse-proxy to do the same forwarding.
 */
const API_BASE = '/api'

const BACKEND_UNAVAILABLE_MSG = 'Backend unavailable — check connection'

// ─────────────────────────────────────────────────────────────────────────────
// Service contract (unchanged — no UI components need to change)
// ─────────────────────────────────────────────────────────────────────────────

export interface IDiagnosticService {
  /**
   * Given a free-text symptom description, return 2-3 clarifying questions
   * that help the AI narrow down the root cause.
   */
  getClarifyingQuestions(symptom: string): Promise<ClarifyingQuestion[]>

  /**
   * Given the original symptom and a map of { questionId → selectedOption },
   * return up to 3 ranked DiagnosisResult objects ordered by confidence desc.
   */
  getDiagnosis(
    answers: Record<string, string>,
    symptom: string,
  ): Promise<DiagnosisResult[]>

  /**
   * Compile everything collected so far into an EscalationBrief ready for
   * a senior technician or back-office hand-off.
   */
  generateEscalationBrief(ctx: EscalationContext): Promise<EscalationBrief>
}

/** Context passed in by the EscalationScreen so the service can POST. */
export interface EscalationContext {
  symptom: string
  /** question text strings that were displayed (for the brief's questionsAsked) */
  questionsAsked: string[]
  topDiagnosis: DiagnosisResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal session cache
// The service stores Q&A metadata between steps so screens don't have to
// thread extra state through router params.
// ─────────────────────────────────────────────────────────────────────────────

interface QARecord {
  question_id: string
  question_text: string
  answer: string
}

interface SessionCache {
  symptom: string
  questions: ClarifyingQuestion[]
  questionsAndAnswers: QARecord[]
}

let _session: SessionCache = {
  symptom: '',
  questions: [],
  questionsAndAnswers: [],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function showError(msg: string) {
  useToastStore.getState().show(msg, 'error')
}

/**
 * Thin wrapper around fetch() that:
 *  - Sets JSON content-type and serialises the body.
 *  - Converts non-2xx responses into thrown Errors (with backend detail).
 *  - Catches network-level failures and shows the "unavailable" toast.
 */
async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    showError(BACKEND_UNAVAILABLE_MSG)
    throw new Error(BACKEND_UNAVAILABLE_MSG)
  }

  if (!res.ok) {
    let detail = `Backend error ${res.status}`
    try {
      const json = await res.json()
      detail = json?.detail ?? json?.message ?? detail
    } catch {
      // ignore parse errors
    }
    showError(detail)
    throw new Error(detail)
  }

  return res.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend response shapes
// (snake_case from FastAPI → camelCase for the frontend)
// ─────────────────────────────────────────────────────────────────────────────

interface BackendQuestion {
  id: string
  question_text: string
  options: string[]
}

interface BackendClarifyResponse {
  questions: BackendQuestion[]
  matched_causes: string[]
  ambiguous: boolean
}

interface BackendDiagnoseResult {
  rank: number
  cause_title: string
  confidence_percent: number
  fix_steps: string[]
  required_parts: string[]
}

interface BackendDiagnoseResponse {
  results: BackendDiagnoseResult[]
  session_id: string
}

interface BackendTopDiagnosis {
  cause_title: string
  confidence_percent: number
  fix_steps: string[]
  required_parts: string[]
}

interface BackendEscalationBriefResponse {
  symptomSummary: string
  questionsAsked: { question_id: string; question_text: string; answer: string }[]
  topDiagnosis: BackendTopDiagnosis
  confidenceScore: number
  suggestedAction: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Real implementation
// ─────────────────────────────────────────────────────────────────────────────

class RealDiagnosticService implements IDiagnosticService {
  // ── 1. Clarify ─────────────────────────────────────────────────────────────

  async getClarifyingQuestions(symptom: string): Promise<ClarifyingQuestion[]> {
    // Reset session for a new triage flow
    _session = { symptom, questions: [], questionsAndAnswers: [] }

    const data = await apiFetch<BackendClarifyResponse>('/symptoms/clarify', {
      symptom,
    })

    // Map snake_case → camelCase
    const questions: ClarifyingQuestion[] = data.questions.map((q) => ({
      id: q.id,
      questionText: q.question_text,
      options: q.options,
    }))

    _session.questions = questions
    return questions
  }

  // ── 2. Diagnose ────────────────────────────────────────────────────────────

  async getDiagnosis(
    answers: Record<string, string>,
    symptom: string,
  ): Promise<DiagnosisResult[]> {
    // Build the answers array the backend expects, preserving question_text
    const answersArray = Object.entries(answers).map(([qid, ans]) => {
      const q = _session.questions.find((x) => x.id === qid)
      return {
        question_id: qid,
        question_text: q?.questionText ?? qid,
        answer: ans,
      }
    })

    // Persist for the escalation step
    _session.questionsAndAnswers = answersArray

    // Use symptom from arg (screen passes it through); fall back to session
    const effectiveSymptom = symptom || _session.symptom

    const data = await apiFetch<BackendDiagnoseResponse>('/symptoms/diagnose', {
      symptom: effectiveSymptom,
      answers: answersArray.map(({ question_id, answer }) => ({
        question_id,
        answer,
      })),
    })

    return data.results.map((r) => ({
      rank: r.rank,
      causeTitle: r.cause_title,
      confidencePercent: r.confidence_percent,
      fixSteps: r.fix_steps,
      requiredParts: r.required_parts,
    }))
  }

  // ── 3. Escalation brief ────────────────────────────────────────────────────

  async generateEscalationBrief(ctx: EscalationContext): Promise<EscalationBrief> {
    const { symptom, topDiagnosis } = ctx

    // Build questionsAndAnswers for the payload.
    // Prefer the cached session data; fall back to the question texts from ctx.
    const qaPayload =
      _session.questionsAndAnswers.length > 0
        ? _session.questionsAndAnswers
        : ctx.questionsAsked.map((qt, i) => ({
            question_id: `q_unknown_${i}`,
            question_text: qt,
            answer: '(not recorded)',
          }))

    const data = await apiFetch<BackendEscalationBriefResponse>('/escalation/generate', {
      symptom,
      questionsAndAnswers: qaPayload,
      topDiagnosis: {
        cause_title: topDiagnosis.causeTitle,
        confidence_percent: topDiagnosis.confidencePercent,
        fix_steps: topDiagnosis.fixSteps,
        required_parts: topDiagnosis.requiredParts,
      },
    })

    // Flatten to the EscalationBrief shape that the EscalationScreen consumes.
    // questionsAsked is typed as string[] in EscalationBrief — project to text.
    const questionsAsked =
      data.questionsAsked.length > 0
        ? data.questionsAsked.map((qa) => qa.question_text)
        : ctx.questionsAsked

    return {
      symptomSummary: data.symptomSummary,
      questionsAsked,
      topDiagnosis: data.topDiagnosis.cause_title,
      confidenceScore: data.confidenceScore,
      // suggestedAction is not in the EscalationBrief type yet; store in notes
      technicianNotes: data.suggestedAction,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const diagnosticService: IDiagnosticService = new RealDiagnosticService()
