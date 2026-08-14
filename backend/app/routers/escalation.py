"""
Escalation Router
=================
Provides the POST /api/escalation/generate endpoint.

Logic
-----
Composes a structured, human-readable brief from the session data supplied
by the caller (symptom, clarifying Q&A, top diagnosis).  Uses pure string
templating — no LLM call — so latency is sub-millisecond.  The "8-10 second"
delay shown in the frontend is a deliberate UX moment, not actual backend work.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter

from app.models.schemas import (
    EscalationBriefRequest,
    EscalationBriefResponse,
    TopDiagnosisInput,
    QAItem,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Suggested-action lookup
# ---------------------------------------------------------------------------

# Maps confidence bands to a canned next-action string for the remote expert.
_ACTION_BY_CONFIDENCE: List[tuple[int, str]] = [
    # (min_confidence_inclusive, suggested_action)
    (85, "High confidence — proceed with targeted repair using the fix steps below. "
         "Remote sign-off may be sufficient; dispatch on-site only if parts are unavailable."),
    (65, "Moderate confidence — verify top diagnosis on-site before ordering parts. "
         "Review the Q&A context and cross-check with local controller logs."),
    (40, "Low confidence — on-site inspection required. "
         "Use the fix steps as a starting checklist but keep differential diagnoses open."),
    (0,  "Uncertain diagnosis — insufficient symptom data. "
         "Escalate to senior engineer for in-person assessment before any repair attempt."),
]


def _suggested_action(confidence: int) -> str:
    """Return the appropriate recommended action string for the given confidence %."""
    for threshold, action in _ACTION_BY_CONFIDENCE:
        if confidence >= threshold:
            return action
    return _ACTION_BY_CONFIDENCE[-1][1]


# ---------------------------------------------------------------------------
# Brief composition helpers
# ---------------------------------------------------------------------------

def _symptom_summary(symptom: str) -> str:
    """Produce a one-sentence, capitalised summary of the reported symptom."""
    cleaned = symptom.strip()
    if not cleaned:
        return "No symptom description provided."
    # Ensure it ends with a full stop and is capitalised.
    summary = cleaned[0].upper() + cleaned[1:]
    if not summary.endswith((".","!","?")):
        summary += "."
    return summary


# ---------------------------------------------------------------------------
# Route handler
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    response_model=EscalationBriefResponse,
    summary="Generate an escalation brief for a remote expert",
    description=(
        "Accepts the session data (symptom, clarifying Q&A, top diagnosis) and "
        "returns a structured, human-readable escalation brief using pure string "
        "templating.  No LLM call is made; response latency is sub-millisecond."
    ),
    tags=["Escalation"],
)
async def generate_brief(body: EscalationBriefRequest) -> EscalationBriefResponse:
    """
    POST /api/escalation/generate

    Deterministic, fast (<1 ms) endpoint that assembles a technician session
    into a structured brief ready for a remote expert to review.
    """
    return EscalationBriefResponse(
        symptomSummary=_symptom_summary(body.symptom),
        questionsAsked=body.questions_and_answers,
        topDiagnosis=body.top_diagnosis,
        confidenceScore=body.top_diagnosis.confidence_percent,
        suggestedAction=_suggested_action(body.top_diagnosis.confidence_percent),
    )
