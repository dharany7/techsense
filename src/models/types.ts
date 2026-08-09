// ─────────────────────────────────────────────────────────────────────────────
// TechSense domain models
// ─────────────────────────────────────────────────────────────────────────────

/** A fault symptom submitted by a technician or captured from a device. */
export interface FaultSymptom {
  /** Unique identifier (UUID or short slug). */
  id: string
  /** Human-readable description of the symptom, e.g. "Elevator door won't close". */
  description: string
  /** ISO-8601 timestamp of when the symptom was recorded. */
  timestamp: string
}

/** A single clarifying question the AI presents to narrow the diagnosis. */
export interface ClarifyingQuestion {
  /** Unique identifier for the question. */
  id: string
  /** The question text shown to the user. */
  questionText: string
  /** Multiple-choice options the user can pick from. */
  options: string[]
}

/** One ranked diagnostic result returned by the AI engine. */
export interface DiagnosisResult {
  /** 1-based rank (1 = most likely cause). */
  rank: number
  /** Short title of the probable root cause. */
  causeTitle: string
  /** Confidence level expressed as a percentage (0–100). */
  confidencePercent: number
  /** Ordered list of remediation steps a technician should follow. */
  fixSteps: string[]
  /** Spare parts or tools required to carry out the fix. */
  requiredParts: string[]
}

/** A structured brief auto-generated for technician escalation / hand-off. */
export interface EscalationBrief {
  /** Plain-English summary of what the technician reported. */
  symptomSummary: string
  /** List of question texts that were asked during triage. */
  questionsAsked: string[]
  /** The #1 ranked diagnosis surfaced by the AI. */
  topDiagnosis: string
  /** Confidence score of the top diagnosis (0–100). */
  confidenceScore: number
  /** Free-text notes the technician may add before escalating. */
  technicianNotes: string
}
