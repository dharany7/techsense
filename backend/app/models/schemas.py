"""
Pydantic schemas for TechSense API.
All request / response models live here (or in sub-modules imported here).
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Shared enumerations
# ---------------------------------------------------------------------------
class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    ESCALATED = "escalated"
    RESOLVED = "resolved"
    CLOSED = "closed"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str = "ok"


# ---------------------------------------------------------------------------
# Diagnostic models
# ---------------------------------------------------------------------------
class DiagnosticRequest(BaseModel):
    issue_description: str = Field(..., min_length=5, max_length=2000)
    device_type: Optional[str] = None
    os_version: Optional[str] = None
    error_code: Optional[str] = None
    additional_context: Optional[str] = None


class DiagnosticStep(BaseModel):
    step_number: int
    instruction: str
    expected_outcome: Optional[str] = None


class DiagnosticResponse(BaseModel):
    issue_id: str
    summary: str
    severity: SeverityLevel
    steps: List[DiagnosticStep]
    related_issues: List[str] = []
    escalate: bool = False
    confidence_score: float = Field(ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Knowledge graph models
# ---------------------------------------------------------------------------
class KnowledgeNode(BaseModel):
    id: str
    label: str
    node_type: str          # e.g. "issue", "device", "solution", "error_code"
    metadata: dict[str, Any] = {}


class KnowledgeEdge(BaseModel):
    source: str
    target: str
    relationship: str       # e.g. "CAUSES", "RESOLVES", "RELATED_TO"
    weight: float = 1.0


class KnowledgeGraphResponse(BaseModel):
    nodes: List[KnowledgeNode]
    edges: List[KnowledgeEdge]
    total_nodes: int
    total_edges: int


# ---------------------------------------------------------------------------
# Escalation models
# ---------------------------------------------------------------------------
class EscalationRequest(BaseModel):
    issue_id: str
    reason: str
    severity: SeverityLevel
    customer_contact: Optional[str] = None
    diagnostic_summary: Optional[str] = None


class EscalationResponse(BaseModel):
    ticket_id: str
    status: TicketStatus
    assigned_to: Optional[str] = None
    estimated_response_time: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Escalation-brief models  (POST /api/escalation/generate)
# ---------------------------------------------------------------------------
class QAItem(BaseModel):
    """A single question + technician answer pair from the clarify step."""
    question_id: str = Field(..., description="Stable slug, e.g. 'q_door_sound'.")
    question_text: str = Field(..., description="Human-readable question that was displayed.")
    answer: str = Field(..., description="The option the technician selected.")


class TopDiagnosisInput(BaseModel):
    """Minimal shape of the top DiagnoseResult passed in by the caller."""
    cause_title: str
    confidence_percent: int = Field(..., ge=0, le=100)
    fix_steps: List[str] = []
    required_parts: List[str] = []


class EscalationBriefRequest(BaseModel):
    """Incoming payload for POST /api/escalation/generate."""
    symptom: str = Field(..., min_length=2, max_length=1000,
                         description="Original free-text symptom from the technician.")
    questions_and_answers: List[QAItem] = Field(
        default=[],
        description="All question / answer pairs collected during the clarify step.",
        alias="questionsAndAnswers",
    )
    top_diagnosis: TopDiagnosisInput = Field(
        ...,
        description="The rank-1 result returned by /api/symptoms/diagnose.",
        alias="topDiagnosis",
    )

    model_config = {"populate_by_name": True}


class EscalationBriefResponse(BaseModel):
    """Structured brief returned by POST /api/escalation/generate."""
    symptom_summary: str = Field(
        ..., description="One-sentence summary of the reported symptom.",
        alias="symptomSummary",
    )
    questions_asked: List[QAItem] = Field(
        ..., description="Echoed Q&A list for the remote expert.",
        alias="questionsAsked",
    )
    top_diagnosis: TopDiagnosisInput = Field(
        ..., description="Highest-confidence diagnosis returned by the engine.",
        alias="topDiagnosis",
    )
    confidence_score: int = Field(
        ..., ge=0, le=100, description="Confidence percentage of the top diagnosis.",
        alias="confidenceScore",
    )
    suggested_action: str = Field(
        ..., description="Recommended next step for the remote expert.",
        alias="suggestedAction",
    )

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Generic API wrapper
# ---------------------------------------------------------------------------
class APIResponse(BaseModel):
    success: bool = True
    data: Optional[Any] = None
    message: Optional[str] = None
    errors: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Symptom clarification models  (POST /api/symptoms/clarify)
# ---------------------------------------------------------------------------
class ClarifyRequest(BaseModel):
    """Incoming request: a free-text symptom description from the technician."""
    symptom: str = Field(..., min_length=2, max_length=1000,
                         description="Free-text description of the observed elevator symptom.")


class ClarifyQuestion(BaseModel):
    """A single disambiguating question with radio-button-style options."""
    id: str = Field(..., description="Stable slug identifier, e.g. 'q_occurrence_pattern'.")
    question_text: str = Field(..., description="Human-readable question for the technician.")
    options: List[str] = Field(..., min_length=2,
                               description="Candidate answers to display as options.")


class ClarifyResponse(BaseModel):
    """
    Response returned by POST /api/symptoms/clarify.

    If the symptom is unambiguous (single dominant cause), ``questions`` is
    empty and ``matched_causes`` already contains ranked results so the
    frontend can skip straight to the results screen.
    """
    questions: List[ClarifyQuestion] = []
    matched_causes: List[str] = Field(
        default=[],
        description="Top cause labels already matched (non-empty when unambiguous).",
    )
    ambiguous: bool = Field(
        default=False,
        description="True when clarification questions are needed.",
    )


# ---------------------------------------------------------------------------
# Symptom diagnosis models  (POST /api/symptoms/diagnose)
# ---------------------------------------------------------------------------
class AnswerItem(BaseModel):
    """One answer submitted by the technician for a clarifying question."""
    question_id: str = Field(..., description="The 'id' from the ClarifyQuestion that was asked.")
    answer: str = Field(..., description="The selected option text or free-text answer.")


class DiagnoseRequest(BaseModel):
    """Incoming request carrying the original symptom plus all technician answers."""
    symptom: str = Field(..., min_length=2, max_length=1000,
                         description="The original free-text symptom description.")
    answers: List[AnswerItem] = Field(
        default=[],
        description="Answers to the clarifying questions previously returned by /clarify.",
    )


class DiagnoseResult(BaseModel):
    """One ranked fault-cause result."""
    rank: int = Field(..., description="1 = highest confidence, 2 = second, etc.")
    cause_title: str = Field(..., description="Human-readable label of the root cause.")
    confidence_percent: int = Field(..., ge=0, le=100,
                                    description="Confidence as a whole-number percentage (0-100).")
    fix_steps: List[str] = Field(default=[], description="Ordered repair instructions.")
    required_parts: List[str] = Field(default=[], description="Spare parts needed for this fix.")


class DiagnoseResponse(BaseModel):
    """Response returned by POST /api/symptoms/diagnose."""
    results: List[DiagnoseResult] = Field(
        ..., description="Top-3 ranked causes, ordered by confidence descending."
    )
    session_id: str = Field(
        default="",
        description="UUID of the service_history row created for this session.",
    )
