"""
Diagnostic Engine Service
Uses Gemini API + knowledge graph to produce step-by-step troubleshooting guides.
"""
import os
import uuid
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

try:
    import google.generativeai as genai

    _GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    if _GEMINI_API_KEY:
        genai.configure(api_key=_GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
    else:
        _gemini_model = None
        print("[DiagnosticEngine] Warning – GEMINI_API_KEY not set. LLM features disabled.")
except ImportError:
    _gemini_model = None
    print("[DiagnosticEngine] google-generativeai not installed. LLM features disabled.")

from app.services.knowledge_graph import knowledge_graph_service
from app.models.schemas import (
    DiagnosticRequest,
    DiagnosticResponse,
    DiagnosticStep,
    SeverityLevel,
)


# ---------------------------------------------------------------------------
# Severity heuristics (extend as needed)
# ---------------------------------------------------------------------------
_HIGH_SEVERITY_KEYWORDS = {
    "blue screen", "bsod", "data loss", "corrupt", "ransomware",
    "virus", "malware", "not booting", "crash", "critical",
}

_MEDIUM_SEVERITY_KEYWORDS = {
    "slow", "lag", "freeze", "overheating", "battery", "wifi",
    "network", "internet", "audio", "display", "printer",
}


def _infer_severity(description: str) -> SeverityLevel:
    desc = description.lower()
    if any(kw in desc for kw in _HIGH_SEVERITY_KEYWORDS):
        return SeverityLevel.HIGH
    if any(kw in desc for kw in _MEDIUM_SEVERITY_KEYWORDS):
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW


# ---------------------------------------------------------------------------
# LLM prompt helpers
# ---------------------------------------------------------------------------
def _build_prompt(req: DiagnosticRequest, related_solutions: list) -> str:
    solutions_hint = (
        "\n".join(f"- {s.get('label', s['id'])}" for s in related_solutions)
        if related_solutions
        else "None found in knowledge base."
    )
    context_parts = []
    if req.device_type:
        context_parts.append(f"Device: {req.device_type}")
    if req.os_version:
        context_parts.append(f"OS: {req.os_version}")
    if req.error_code:
        context_parts.append(f"Error code: {req.error_code}")
    context_str = " | ".join(context_parts) if context_parts else "Not provided"

    return f"""You are TechSense, an expert IT support diagnostic assistant.

User issue: {req.issue_description}
Context: {context_str}

Known solutions from our knowledge base:
{solutions_hint}

Provide a structured JSON response with:
1. "summary": A 1-2 sentence summary of the problem.
2. "steps": An array of {{ "step_number": int, "instruction": str, "expected_outcome": str }} with 3-6 actionable steps.
3. "escalate": true if the issue needs human escalation, false otherwise.
4. "confidence_score": float 0.0-1.0 indicating how confident you are.
5. "related_issues": list of 2-3 related issue keywords.

Respond with valid JSON only. No markdown, no explanation.
"""


# ---------------------------------------------------------------------------
# Fallback (no LLM available)
# ---------------------------------------------------------------------------
def _fallback_response(req: DiagnosticRequest, severity: SeverityLevel) -> DiagnosticResponse:
    return DiagnosticResponse(
        issue_id=str(uuid.uuid4()),
        summary=f"Issue received: {req.issue_description[:100]}",
        severity=severity,
        steps=[
            DiagnosticStep(
                step_number=1,
                instruction="Restart the affected device and check if the issue persists.",
                expected_outcome="Issue may resolve after a fresh boot.",
            ),
            DiagnosticStep(
                step_number=2,
                instruction="Check for pending OS and driver updates and install them.",
                expected_outcome="Updates may patch the underlying bug.",
            ),
            DiagnosticStep(
                step_number=3,
                instruction="If the issue persists, note the exact error message and escalate to Level 2 support.",
                expected_outcome="Human agent will perform deeper diagnostics.",
            ),
        ],
        related_issues=[],
        escalate=severity == SeverityLevel.HIGH,
        confidence_score=0.4,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def run_diagnostic(req: DiagnosticRequest) -> DiagnosticResponse:
    """
    Main diagnostic entry point.
    1. Infers severity from keywords.
    2. Queries knowledge graph for related solutions.
    3. Calls Gemini to generate structured troubleshooting steps.
    4. Falls back gracefully if LLM is unavailable.
    """
    import json

    severity = _infer_severity(req.issue_description)

    # Query knowledge graph for hints
    matched_nodes = knowledge_graph_service.search_nodes(req.issue_description)
    related_solutions: list = []
    for node in matched_nodes[:3]:
        solutions = knowledge_graph_service.get_solutions_for_issue(node["id"])
        related_solutions.extend(solutions)

    if _gemini_model is None:
        return _fallback_response(req, severity)

    prompt = _build_prompt(req, related_solutions)

    try:
        response = _gemini_model.generate_content(prompt)
        raw = response.text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)

        steps = [
            DiagnosticStep(
                step_number=s["step_number"],
                instruction=s["instruction"],
                expected_outcome=s.get("expected_outcome"),
            )
            for s in data.get("steps", [])
        ]

        return DiagnosticResponse(
            issue_id=str(uuid.uuid4()),
            summary=data.get("summary", "Issue analysed."),
            severity=severity,
            steps=steps,
            related_issues=data.get("related_issues", []),
            escalate=data.get("escalate", severity == SeverityLevel.HIGH),
            confidence_score=float(data.get("confidence_score", 0.7)),
        )

    except Exception as exc:
        print(f"[DiagnosticEngine] LLM error: {exc}")
        return _fallback_response(req, severity)
