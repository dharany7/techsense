"""
Diagnostic Router
=================
Provides elevator fault diagnostic endpoints.

Endpoints
---------
POST /api/symptoms/clarify
    Extract keywords from a free-text symptom, query the knowledge graph for
    matching fault causes, and — if multiple causes cluster closely in
    confidence — return 2-3 targeted clarifying questions derived entirely
    from graph metadata.
    Pure graph logic; no LLM call; target latency < 100 ms.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter

from app.models.schemas import (
    ClarifyQuestion,
    ClarifyRequest,
    ClarifyResponse,
    AnswerItem,
    DiagnoseRequest,
    DiagnoseResult,
    DiagnoseResponse,
)
from app.services.knowledge_graph import (
    knowledge_graph_service,
    query_graph,
    log_diagnosis_session,
    _normalise,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Constants / tunables
# ---------------------------------------------------------------------------

# Two causes are "ambiguous" when their confidence scores are within this band
_AMBIGUITY_BAND: float = 0.15

# We only consider the top N causes when deciding whether to ask questions
_MAX_CAUSES_TO_CONSIDER: int = 5

# Minimum keyword match score to include a result at all
_MIN_SCORE: float = 0.0


# ---------------------------------------------------------------------------
# Rule table: keyword triggers -> list of ClarifyQuestion dicts
#
# Each entry fires when *any* of the trigger keywords appear in the normalised
# symptom text AND the graph returns ambiguous causes.  Questions are merged
# and deduplicated (by `id`) across all matching rules.
# ---------------------------------------------------------------------------

_RULE_TABLE: List[Dict[str, Any]] = [
    # -- DOOR FAULTS ---------------------------------------------------------
    {
        "triggers": {"door", "closing", "open", "stuck", "close"},
        "questions": [
            {
                "id": "q_door_which_door",
                "question_text": "Which door is affected?",
                "options": [
                    "Landing door only (floor level)",
                    "Car door only (cabin level)",
                    "Both landing and car door",
                    "Not sure",
                ],
            },
            {
                "id": "q_door_pattern",
                "question_text": "When does the door problem occur?",
                "options": [
                    "Every floor, every trip",
                    "Only at specific floors",
                    "Intermittently / random floors",
                    "Only after the elevator has been idle",
                ],
            },
            {
                "id": "q_door_sound",
                "question_text": "Is there any sound when the door tries to close?",
                "options": [
                    "Motor hum but door does not move",
                    "Clicking / relay noise then stops",
                    "Door starts closing then reverses",
                    "Completely silent, no attempt to close",
                ],
            },
        ],
    },
    # -- CABIN JERKING / ROUGH RIDE ------------------------------------------
    {
        "triggers": {"jerking", "jerk", "vibration", "rough", "shaking", "bumpy"},
        "questions": [
            {
                "id": "q_jerk_when",
                "question_text": "At what point during the trip does the jerking occur?",
                "options": [
                    "Only at start-up (leaving a floor)",
                    "Only during deceleration (approaching a floor)",
                    "Throughout the entire journey",
                    "Only at mid-speed (high-speed section)",
                ],
            },
            {
                "id": "q_jerk_floors",
                "question_text": "Does the jerking happen at every floor or specific floors?",
                "options": [
                    "Every floor consistently",
                    "Only on upper floors",
                    "Only on lower floors",
                    "Random, unpredictable floors",
                ],
            },
            {
                "id": "q_jerk_load",
                "question_text": "Does the cabin load affect the severity?",
                "options": [
                    "Worse when cabin is empty",
                    "Worse when cabin is full or heavy load",
                    "Same regardless of load",
                    "Have not tested different loads",
                ],
            },
        ],
    },
    # -- NOISE ---------------------------------------------------------------
    {
        "triggers": {"noise", "sound", "grinding", "squealing", "banging",
                     "clunking", "rumbling", "screeching", "hum", "humming"},
        "questions": [
            {
                "id": "q_noise_type",
                "question_text": "How would you best describe the noise?",
                "options": [
                    "Grinding or metallic scraping",
                    "Squealing / high-pitched squeal",
                    "Banging or thumping",
                    "Low rumble or vibration hum",
                    "Clicking or ratcheting",
                ],
            },
            {
                "id": "q_noise_location",
                "question_text": "Where does the noise appear to originate?",
                "options": [
                    "Machine room / motor area",
                    "Inside the shaft while moving",
                    "Door mechanism when opening or closing",
                    "Cabin interior / floor",
                    "Pit area",
                ],
            },
            {
                "id": "q_noise_when",
                "question_text": "When is the noise most prominent?",
                "options": [
                    "Only when moving up",
                    "Only when moving down",
                    "Both directions",
                    "When stationary during door operation",
                ],
            },
        ],
    },
    # -- ERROR CODES ---------------------------------------------------------
    {
        "triggers": {"e14", "e22", "e30", "error", "fault", "code"},
        "questions": [
            {
                "id": "q_error_frequency",
                "question_text": "How often does the error code appear?",
                "options": [
                    "Constant, stays on until manually cleared",
                    "Intermittent, clears itself then reappears",
                    "First time ever seen",
                    "Started after recent maintenance or power event",
                ],
            },
            {
                "id": "q_error_reset",
                "question_text": "Does the elevator recover after a controller reset?",
                "options": [
                    "Yes, runs normally until the code returns",
                    "Partially, runs but with degraded performance",
                    "No, immediately faults again after reset",
                    "Have not attempted a reset yet",
                ],
            },
        ],
    },
    # -- OVERSHOOT / UNDERSHOOT / LEVELING -----------------------------------
    {
        "triggers": {"overshoot", "undershoot", "leveling", "level", "sill",
                     "landing", "stopping"},
        "questions": [
            {
                "id": "q_level_direction",
                "question_text": "In which direction does the cabin mis-level?",
                "options": [
                    "Always stops too high (cabin above floor sill)",
                    "Always stops too low (cabin below floor sill)",
                    "Alternates, sometimes high sometimes low",
                    "Only mis-levels in one travel direction",
                ],
            },
            {
                "id": "q_level_floors",
                "question_text": "Is the mis-leveling consistent across all floors?",
                "options": [
                    "All floors affected equally",
                    "Only top floors affected",
                    "Only bottom floors affected",
                    "Specific middle floors only",
                    "Varies, no clear pattern",
                ],
            },
            {
                "id": "q_level_load",
                "question_text": "Does the mis-leveling change with cabin load?",
                "options": [
                    "Worse with heavy load",
                    "Worse with no load (empty cabin)",
                    "Load has no effect",
                    "Not tested under different loads",
                ],
            },
        ],
    },
    # -- POWER / RECOVERY ----------------------------------------------------
    {
        "triggers": {"power", "ard", "rescue", "battery", "blackout",
                     "restart", "ups", "emergency"},
        "questions": [
            {
                "id": "q_power_ard_led",
                "question_text": "What is the status of the ARD / UPS indicator LED?",
                "options": [
                    "Solid red or amber fault light",
                    "Green / no fault indicated",
                    "LED is off / no display",
                    "No ARD unit installed on this elevator",
                ],
            },
            {
                "id": "q_power_after_restore",
                "question_text": "What happens when mains power is restored?",
                "options": [
                    "Elevator restarts normally on its own",
                    "Requires manual reset before it will run",
                    "Displays an error code immediately on power-up",
                    "Main contactor clicks but motor does not start",
                ],
            },
        ],
    },
    # -- OVERLOAD ------------------------------------------------------------
    {
        "triggers": {"overload", "heavy", "load", "weighing", "capacity"},
        "questions": [
            {
                "id": "q_overload_empty",
                "question_text": "Does the overload alarm trigger even when the cabin is empty?",
                "options": [
                    "Yes, alarm fires with no passengers",
                    "Only triggers above roughly 50% rated load",
                    "Only at or near 100% rated capacity",
                    "Triggers at random, unpredictable loads",
                ],
            },
            {
                "id": "q_overload_recent_change",
                "question_text": "Was there any recent maintenance before the overload alarm started?",
                "options": [
                    "Load cell / weighing device was recently serviced",
                    "Control board was replaced or re-programmed",
                    "No recent changes, appeared suddenly",
                    "After a power failure or voltage spike",
                ],
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tokenise(text: str) -> set:
    """Lowercase, strip punctuation, return unique word tokens."""
    return set(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def _extract_keywords(symptom: str) -> List[str]:
    """
    Return a list of meaningful tokens from *symptom*, filtering out common
    English stop-words that would add noise to graph queries.
    """
    STOP = {
        "the", "a", "an", "is", "it", "in", "on", "at", "to", "of", "and",
        "or", "but", "not", "for", "with", "this", "that", "my", "our",
        "has", "have", "had", "be", "been", "are", "was", "were", "do",
        "does", "did", "will", "would", "can", "could", "i", "we", "they",
        "he", "she", "you", "me", "us", "them", "its", "from", "by", "as",
        "up", "down", "just", "also", "when", "what", "how", "why",
    }
    tokens = _tokenise(symptom)
    return [t for t in tokens if t not in STOP and len(t) > 1]


def _causes_are_ambiguous(results: List[Tuple]) -> bool:
    """
    Return True when there are >= 2 results and the top-2 confidence scores
    are within _AMBIGUITY_BAND of each other.
    """
    if len(results) < 2:
        return False
    return (results[0][1] - results[1][1]) <= _AMBIGUITY_BAND


def _questions_for_symptom(
    symptom_tokens: set,
    results: List[Tuple],
) -> List[ClarifyQuestion]:
    """
    Match symptom_tokens against the rule table and return a deduplicated
    list of up to 3 ClarifyQuestion objects most relevant to the ambiguous
    causes.
    """
    seen_ids: set = set()
    questions: List[ClarifyQuestion] = []

    for rule in _RULE_TABLE:
        if not (rule["triggers"] & symptom_tokens):
            continue
        for q_def in rule["questions"]:
            if q_def["id"] in seen_ids:
                continue
            seen_ids.add(q_def["id"])
            questions.append(
                ClarifyQuestion(
                    id=q_def["id"],
                    question_text=q_def["question_text"],
                    options=q_def["options"],
                )
            )
            if len(questions) == 3:
                return questions

    return questions


def _generic_questions(results: List[Tuple]) -> List[ClarifyQuestion]:
    """
    Fallback: when no rule matches the tokens, generate generic questions
    derived from the top cause labels returned by the graph.
    """
    cause_labels = [r[0] for r in results[:_MAX_CAUSES_TO_CONSIDER]]
    options = cause_labels[:4]
    if len(options) < 4:
        options.append("None of the above")

    return [
        ClarifyQuestion(
            id="q_generic_which_cause",
            question_text="Which of the following best describes the problem?",
            options=options,
        ),
        ClarifyQuestion(
            id="q_generic_duration",
            question_text="How long has this symptom been present?",
            options=[
                "Just started today",
                "Past few days",
                "Several weeks",
                "Months or longer",
            ],
        ),
        ClarifyQuestion(
            id="q_generic_frequency",
            question_text="How frequently does the symptom occur?",
            options=[
                "Every single trip",
                "Multiple times per day",
                "Once or twice a day",
                "Intermittent / occasional",
            ],
        ),
    ]


# ---------------------------------------------------------------------------
# Route handler
# ---------------------------------------------------------------------------

@router.post(
    "/clarify",
    response_model=ClarifyResponse,
    summary="Clarify an ambiguous elevator symptom",
    description=(
        "Extracts keywords from the free-text symptom, queries the knowledge "
        "graph for matching fault causes, and — when multiple causes cluster "
        f"within {int(_AMBIGUITY_BAND * 100)} confidence points — returns up "
        "to 3 targeted disambiguating questions. "
        "Pure graph logic, no LLM call required."
    ),
    tags=["Diagnostics"],
)
async def clarify_symptom(body: ClarifyRequest) -> ClarifyResponse:
    """
    POST /api/symptoms/clarify

    Fast (<100 ms) endpoint that uses the knowledge graph alone to decide
    whether the symptom is clear enough to diagnose immediately, or whether
    the technician needs to answer clarifying questions first.
    """
    # 1. Keyword extraction -----------------------------------------------
    keywords = _extract_keywords(body.symptom)
    symptom_tokens = _tokenise(body.symptom)

    if not keywords:
        return ClarifyResponse(
            questions=[
                ClarifyQuestion(
                    id="q_no_keywords",
                    question_text="Could you describe the elevator fault in more detail?",
                    options=[
                        "Door not opening or closing",
                        "Cabin moving erratically",
                        "Error code displayed on controller",
                        "Unusual noise or vibration",
                        "Elevator will not start after power event",
                    ],
                )
            ],
            matched_causes=[],
            ambiguous=True,
        )

    # 2. Query the knowledge graph ----------------------------------------
    results = query_graph(keywords)
    results = [r for r in results if r[1] > _MIN_SCORE][:_MAX_CAUSES_TO_CONSIDER]

    # 3a. No graph match --------------------------------------------------
    if not results:
        return ClarifyResponse(
            questions=[
                ClarifyQuestion(
                    id="q_unrecognised_symptom",
                    question_text=(
                        "We could not match your description to a known fault. "
                        "Which category fits best?"
                    ),
                    options=[
                        "Door fault (not opening / closing)",
                        "Cabin movement issue (jerking, vibration, leveling)",
                        "Controller error code",
                        "Unusual noise",
                        "Power / ARD / recovery failure",
                        "Overload alarm",
                        "Other",
                    ],
                )
            ],
            matched_causes=[],
            ambiguous=True,
        )

    # 3b. Single dominant cause -- unambiguous ----------------------------
    if not _causes_are_ambiguous(results):
        return ClarifyResponse(
            questions=[],
            matched_causes=[r[0] for r in results[:3]],
            ambiguous=False,
        )

    # 3c. Ambiguous -- generate clarifying questions ----------------------
    questions = _questions_for_symptom(symptom_tokens, results)

    if not questions:
        questions = _generic_questions(results)

    return ClarifyResponse(
        questions=questions[:3],
        matched_causes=[r[0] for r in results[:3]],
        ambiguous=True,
    )


# ---------------------------------------------------------------------------
# Answer-boost helpers
# ---------------------------------------------------------------------------

# Maps (question_id prefix, answer keyword) → multiplicative confidence boost.
# A boost > 1.0 increases a cause's rank; < 1.0 penalises it.
# Only the first matching rule per cause is applied.
_ANSWER_BOOSTS: List[Dict[str, Any]] = [
    # Jerking questions
    {
        "question_id": "q_jerk_when",
        "answer_keywords": {"start-up", "leaving"},
        "cause_keywords": {"lubrication", "roller"},
        "boost": 1.35,
    },
    {
        "question_id": "q_jerk_when",
        "answer_keywords": {"deceleration", "approaching"},
        "cause_keywords": {"vvvf", "inverter", "drive", "parameter"},
        "boost": 1.40,
    },
    {
        "question_id": "q_jerk_when",
        "answer_keywords": {"throughout", "entire"},
        "cause_keywords": {"guide", "roller", "rail"},
        "boost": 1.30,
    },
    {
        "question_id": "q_jerk_floors",
        "answer_keywords": {"every", "consistently"},
        "cause_keywords": {"vvvf", "inverter", "parameter", "drive"},
        "boost": 1.25,
    },
    {
        "question_id": "q_jerk_floors",
        "answer_keywords": {"upper"},
        "cause_keywords": {"lubrication", "rail"},
        "boost": 1.20,
    },
    {
        "question_id": "q_jerk_load",
        "answer_keywords": {"heavy", "full"},
        "cause_keywords": {"lubrication", "guide", "roller"},
        "boost": 1.25,
    },
    {
        "question_id": "q_jerk_load",
        "answer_keywords": {"empty"},
        "cause_keywords": {"vvvf", "parameter", "drive"},
        "boost": 1.30,
    },
    # Door questions
    {
        "question_id": "q_door_sound",
        "answer_keywords": {"motor", "hum", "does not move"},
        "cause_keywords": {"motor", "belt", "operator"},
        "boost": 1.45,
    },
    {
        "question_id": "q_door_sound",
        "answer_keywords": {"silent", "no attempt"},
        "cause_keywords": {"controller", "board"},
        "boost": 1.40,
    },
    {
        "question_id": "q_door_sound",
        "answer_keywords": {"reverses", "starts closing"},
        "cause_keywords": {"sensor", "obstruction"},
        "boost": 1.50,
    },
    {
        "question_id": "q_door_pattern",
        "answer_keywords": {"specific", "floors"},
        "cause_keywords": {"sensor", "landing"},
        "boost": 1.20,
    },
    {
        "question_id": "q_door_which_door",
        "answer_keywords": {"landing"},
        "cause_keywords": {"sensor", "obstruction"},
        "boost": 1.15,
    },
    # Noise questions
    {
        "question_id": "q_noise_type",
        "answer_keywords": {"grinding", "scraping"},
        "cause_keywords": {"brake", "sheave", "rope"},
        "boost": 1.45,
    },
    {
        "question_id": "q_noise_type",
        "answer_keywords": {"banging", "thumping"},
        "cause_keywords": {"buffer", "pit"},
        "boost": 1.50,
    },
    {
        "question_id": "q_noise_location",
        "answer_keywords": {"machine", "motor"},
        "cause_keywords": {"brake", "sheave"},
        "boost": 1.35,
    },
    {
        "question_id": "q_noise_location",
        "answer_keywords": {"pit"},
        "cause_keywords": {"buffer"},
        "boost": 1.40,
    },
    {
        "question_id": "q_noise_when",
        "answer_keywords": {"up"},
        "cause_keywords": {"sheave", "rope"},
        "boost": 1.20,
    },
    # Leveling questions
    {
        "question_id": "q_level_direction",
        "answer_keywords": {"too high", "above floor"},
        "cause_keywords": {"sensor", "vane", "leveling"},
        "boost": 1.40,
    },
    {
        "question_id": "q_level_direction",
        "answer_keywords": {"too low", "below floor"},
        "cause_keywords": {"deceleration", "ramp", "drive"},
        "boost": 1.35,
    },
    {
        "question_id": "q_level_load",
        "answer_keywords": {"heavy"},
        "cause_keywords": {"load", "weighing", "calibration"},
        "boost": 1.45,
    },
    # Error code questions
    {
        "question_id": "q_error_reset",
        "answer_keywords": {"immediately", "faults again"},
        "cause_keywords": {"safety", "chain", "encoder"},
        "boost": 1.30,
    },
    {
        "question_id": "q_error_frequency",
        "answer_keywords": {"constant", "stays on"},
        "cause_keywords": {"thermal", "overload", "ptc"},
        "boost": 1.25,
    },
    # Power / ARD questions
    {
        "question_id": "q_power_ard_led",
        "answer_keywords": {"red", "amber", "fault"},
        "cause_keywords": {"battery", "ard", "depleted"},
        "boost": 1.50,
    },
    {
        "question_id": "q_power_after_restore",
        "answer_keywords": {"contactor", "motor does not start"},
        "cause_keywords": {"contactor", "main line"},
        "boost": 1.40,
    },
    # Overload questions
    {
        "question_id": "q_overload_empty",
        "answer_keywords": {"empty", "no passengers"},
        "cause_keywords": {"load cell", "weighing"},
        "boost": 1.55,
    },
]


def _apply_answer_boosts(
    results: List[Tuple],
    answers: List[AnswerItem],
) -> List[Tuple]:
    """
    Re-score the graph results using the technician's answers.

    For each (question_id, answer) pair the boost table is checked.  When a
    rule's answer_keywords overlap with the given answer AND the cause label
    contains one of the rule's cause_keywords, a multiplicative boost is
    applied to that cause's confidence.  Only the highest applicable boost
    per cause is used to avoid double-counting.

    Parameters
    ----------
    results : list of (cause_label, confidence, fix_steps, required_parts)
        Raw output from query_graph().
    answers : list of AnswerItem
        Technician's responses from the /clarify step.

    Returns
    -------
    list of the same shape, re-sorted by boosted confidence.
    """
    if not answers:
        return results

    # Build a quick lookup: question_id -> normalised answer tokens
    answer_map: Dict[str, set] = {}
    for ai in answers:
        answer_map[ai.question_id] = set(_normalise(ai.answer).split())

    boosted: List[Tuple] = []
    for cause_label, conf, steps, parts in results:
        cause_tokens = set(_normalise(cause_label).split())
        best_boost: float = 1.0

        for rule in _ANSWER_BOOSTS:
            qid = rule["question_id"]
            if qid not in answer_map:
                continue

            # Does the technician's answer contain any of the trigger keywords?
            ans_tokens = answer_map[qid]
            rule_ans_kws = {_normalise(k) for k in rule["answer_keywords"]}
            # Use substring matching so multi-word keys like "too high" still hit
            ans_text = " ".join(ans_tokens)
            ans_hit = any(kw in ans_text for kw in rule_ans_kws)
            if not ans_hit:
                continue

            # Does the cause label mention any of the rule's cause keywords?
            rule_cause_kws = {_normalise(k) for k in rule["cause_keywords"]}
            cause_text = " ".join(cause_tokens)
            cause_hit = any(kw in cause_text for kw in rule_cause_kws)
            if not cause_hit:
                continue

            best_boost = max(best_boost, rule["boost"])

        boosted_conf = min(conf * best_boost, 1.0)  # cap at 1.0
        boosted.append((cause_label, round(boosted_conf, 4), steps, parts))

    boosted.sort(key=lambda t: t[1], reverse=True)
    return boosted


# ---------------------------------------------------------------------------
# /diagnose route handler
# ---------------------------------------------------------------------------

@router.post(
    "/diagnose",
    response_model=DiagnoseResponse,
    summary="Diagnose an elevator fault with clarifying answers",
    description=(
        "Accepts the original symptom plus the technician's answers to the "
        "clarifying questions returned by /clarify.  Applies answer-based "
        "confidence boosts to the knowledge-graph results and returns the "
        "top-3 ranked fault causes with fix steps and required parts.  "
        "Each session is persisted to the service_history table."
    ),
    tags=["Diagnostics"],
)
async def diagnose_symptom(body: DiagnoseRequest) -> DiagnoseResponse:
    """
    POST /api/symptoms/diagnose

    Narrows the graph traversal using the technician's clarifying answers,
    re-ranks causes by boosted confidence, and logs the session.
    """
    # 1. Extract keywords & query graph -----------------------------------
    keywords = _extract_keywords(body.symptom)

    if not keywords:
        # Nothing to match — return empty results with a logged session
        session_id = log_diagnosis_session(
            symptom=body.symptom,
            top_cause=None,
            confidence=None,
        )
        return DiagnoseResponse(results=[], session_id=session_id)

    raw_results = query_graph(keywords)
    raw_results = [r for r in raw_results if r[1] > _MIN_SCORE][:_MAX_CAUSES_TO_CONSIDER]

    if not raw_results:
        session_id = log_diagnosis_session(
            symptom=body.symptom,
            top_cause=None,
            confidence=None,
        )
        return DiagnoseResponse(results=[], session_id=session_id)

    # 2. Apply answer boosts ---------------------------------------------
    boosted = _apply_answer_boosts(raw_results, body.answers)

    # 3. Build top-3 response objects ------------------------------------
    top3 = boosted[:3]
    results: List[DiagnoseResult] = [
        DiagnoseResult(
            rank=rank,
            cause_title=cause_label,
            confidence_percent=int(round(conf * 100)),
            fix_steps=steps,
            required_parts=parts,
        )
        for rank, (cause_label, conf, steps, parts) in enumerate(top3, start=1)
    ]

    # 4. Log to service_history ------------------------------------------
    top = top3[0]
    session_id = log_diagnosis_session(
        symptom=body.symptom,
        top_cause=top[0],
        confidence=top[1],
    )

    return DiagnoseResponse(results=results, session_id=session_id)
