import type {
  ClarifyingQuestion,
  DiagnosisResult,
  EscalationBrief,
} from '../models/types'

// ─────────────────────────────────────────────────────────────────────────────
// Contract — swap MockDiagnosticService for a RealDiagnosticService that calls
// your FastAPI endpoints without touching any UI component.
// ─────────────────────────────────────────────────────────────────────────────

export interface IDiagnosticService {
  /**
   * Given a free-text symptom description, return 2-3 clarifying questions
   * that help the AI narrow down the root cause.
   */
  getClarifyingQuestions(symptom: string): Promise<ClarifyingQuestion[]>

  /**
   * Given a map of { questionId → selectedOption }, return up to 3 ranked
   * DiagnosisResult objects ordered by confidence descending.
   */
  getDiagnosis(answers: Record<string, string>): Promise<DiagnosisResult[]>

  /**
   * Compile everything collected so far into an EscalationBrief ready for
   * a senior technician or back-office hand-off.
   */
  generateEscalationBrief(): Promise<EscalationBrief>
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — wraps setTimeout in a Promise so async/await works cleanly.
// ─────────────────────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_QUESTIONS: Record<string, ClarifyingQuestion[]> = {
  default: [
    {
      id: 'q1',
      questionText: 'When did this fault first occur?',
      options: [
        'Less than 1 hour ago',
        '1–8 hours ago',
        'More than 8 hours ago',
        'Intermittent / recurring',
      ],
    },
    {
      id: 'q2',
      questionText: 'Is any error code displayed on the controller panel?',
      options: [
        'E01 – Door obstruction',
        'E05 – Motor overload',
        'E12 – Communication fault',
        'No error code shown',
      ],
    },
    {
      id: 'q3',
      questionText: 'What is the current operating environment temperature?',
      options: [
        'Below 0 °C',
        '0–25 °C (normal)',
        '25–40 °C',
        'Above 40 °C',
      ],
    },
  ],
}

const MOCK_DIAGNOSES: DiagnosisResult[] = [
  {
    rank: 1,
    causeTitle: 'Worn Door Clutch Mechanism',
    confidencePercent: 92,
    fixSteps: [
      'Power down the elevator and lock out/tag out.',
      'Remove the hoistway door panel to access the clutch assembly.',
      'Inspect the vane and roller cam for wear or deformation.',
      'Replace the door clutch assembly (part #DCU-4420).',
      'Re-align door to within 3 mm of centre using the alignment tool.',
      'Restore power and run 5 full door-cycle tests.',
    ],
    requiredParts: ['Door Clutch Assembly #DCU-4420', 'M8 hex bolts (×4)', 'Anti-seize lubricant'],
  },
  {
    rank: 2,
    causeTitle: 'Faulty Door Motor Drive Board',
    confidencePercent: 67,
    fixSteps: [
      'Measure input voltage to drive board — expected 24 VDC ±5%.',
      'Inspect the PCB for burnt components or swollen capacitors.',
      'Swap in the replacement drive board (part #DMB-2201).',
      'Update firmware if board revision differs from existing unit.',
      'Perform a full door open/close calibration sequence.',
    ],
    requiredParts: ['Drive Board #DMB-2201', 'ESD strap', 'Firmware USB stick'],
  },
  {
    rank: 3,
    causeTitle: 'Misaligned Door Safety Edge Sensor',
    confidencePercent: 45,
    fixSteps: [
      'Clean the safety edge sensor strip with isopropyl alcohol.',
      'Check sensor mounting screws — tighten if loose.',
      'Re-calibrate sensor gap to 2–4 mm using a feeler gauge.',
      'Test obstruction detection by placing an object in the door path.',
    ],
    requiredParts: ['Safety edge sensor #SES-110 (if replacement needed)', 'Feeler gauge set'],
  },
]

const MOCK_BRIEF: EscalationBrief = {
  symptomSummary:
    'Elevator door fails to close fully on floor 7. The door reverses immediately after reaching 80% closed position. Fault is consistent and non-intermittent.',
  questionsAsked: [
    'When did this fault first occur?',
    'Is any error code displayed on the controller panel?',
    'What is the current operating environment temperature?',
  ],
  topDiagnosis: 'Worn Door Clutch Mechanism',
  confidenceScore: 92,
  technicianNotes:
    'Unit has been in service for 11 years. Last preventive maintenance was 18 months ago. Door clutch was not replaced during last PM cycle.',
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock implementation — simulates network latency via delay()
// ─────────────────────────────────────────────────────────────────────────────

class MockDiagnosticService implements IDiagnosticService {
  /**
   * Returns 2-3 clarifying questions after an 800 ms simulated network delay.
   * The `symptom` param is accepted so the real implementation can POST it
   * to the FastAPI endpoint without a signature change.
   */
  async getClarifyingQuestions(_symptom: string): Promise<ClarifyingQuestion[]> {
    await delay(800)
    // Real implementation: POST /api/diagnose/questions  { symptom }
    return MOCK_QUESTIONS['default']
  }

  /**
   * Returns 3 ranked diagnoses after a 1 200 ms simulated network delay.
   * The `answers` map is accepted so the real implementation can POST it
   * to the FastAPI endpoint without a signature change.
   */
  async getDiagnosis(_answers: Record<string, string>): Promise<DiagnosisResult[]> {
    await delay(1200)
    // Real implementation: POST /api/diagnose/result  { answers }
    return MOCK_DIAGNOSES
  }

  /**
   * Returns a pre-compiled EscalationBrief after a 400 ms simulated delay.
   */
  async generateEscalationBrief(): Promise<EscalationBrief> {
    await delay(400)
    // Real implementation: POST /api/diagnose/escalate
    return MOCK_BRIEF
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export — import `diagnosticService` anywhere in the UI.
// To switch to the real backend, replace `new MockDiagnosticService()` with
// `new RealDiagnosticService(API_BASE_URL)` — no component code changes needed.
// ─────────────────────────────────────────────────────────────────────────────

export const diagnosticService: IDiagnosticService = new MockDiagnosticService()
