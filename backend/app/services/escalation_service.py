"""
Escalation Service
Handles ticket creation and routing for issues that exceed automated resolution capability.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from app.models.schemas import (
    EscalationRequest,
    EscalationResponse,
    SeverityLevel,
    TicketStatus,
)

# ---------------------------------------------------------------------------
# In-memory ticket store (replace with DB layer when ready)
# ---------------------------------------------------------------------------
_ticket_store: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Routing rules
# ---------------------------------------------------------------------------
_SEVERITY_ROUTING = {
    SeverityLevel.LOW:      ("L1-Queue",   "4 hours"),
    SeverityLevel.MEDIUM:   ("L2-Queue",   "2 hours"),
    SeverityLevel.HIGH:     ("L2-Senior",  "30 minutes"),
    SeverityLevel.CRITICAL: ("L3-Oncall",  "15 minutes"),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def create_escalation(req: EscalationRequest) -> EscalationResponse:
    """
    Create a support escalation ticket and route it based on severity.
    Returns a ticket ID and estimated response time.
    """
    ticket_id = f"TSK-{str(uuid.uuid4())[:8].upper()}"
    assigned_to, eta = _SEVERITY_ROUTING.get(
        req.severity, ("L2-Queue", "2 hours")
    )

    ticket = {
        "ticket_id": ticket_id,
        "issue_id": req.issue_id,
        "reason": req.reason,
        "severity": req.severity,
        "status": TicketStatus.OPEN,
        "assigned_to": assigned_to,
        "estimated_response_time": eta,
        "customer_contact": req.customer_contact,
        "diagnostic_summary": req.diagnostic_summary,
        "created_at": datetime.utcnow().isoformat(),
    }
    _ticket_store[ticket_id] = ticket

    print(
        f"[EscalationService] Ticket {ticket_id} created – "
        f"severity={req.severity}, assigned to {assigned_to}, ETA {eta}"
    )

    return EscalationResponse(
        ticket_id=ticket_id,
        status=TicketStatus.OPEN,
        assigned_to=assigned_to,
        estimated_response_time=eta,
        created_at=datetime.utcnow(),
    )


async def get_ticket(ticket_id: str) -> Optional[dict]:
    """Retrieve a ticket by ID."""
    return _ticket_store.get(ticket_id)


async def list_tickets(status: Optional[TicketStatus] = None) -> list:
    """List all tickets, optionally filtered by status."""
    tickets = list(_ticket_store.values())
    if status:
        tickets = [t for t in tickets if t["status"] == status]
    return tickets


async def update_ticket_status(ticket_id: str, new_status: TicketStatus) -> Optional[dict]:
    """Update the status of an existing ticket."""
    if ticket_id not in _ticket_store:
        return None
    _ticket_store[ticket_id]["status"] = new_status
    return _ticket_store[ticket_id]
