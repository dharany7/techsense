"""
Database setup – SQLite via SQLAlchemy.
Provides a session factory and Base declarative class for ORM models.
"""
import os
from sqlalchemy import create_engine, Column, String, Text, DateTime, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tech_sense.db")

# For SQLite we need connect_args to allow multi-threaded access
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------
class DiagnosticRecord(Base):
    """Persists each diagnostic run for analytics and audit."""
    __tablename__ = "diagnostic_records"

    id = Column(String, primary_key=True, index=True)
    issue_description = Column(Text, nullable=False)
    summary = Column(Text)
    severity = Column(String, default="low")
    steps_json = Column(Text)          # JSON-serialised list of steps
    escalate = Column(Boolean, default=False)
    confidence_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class EscalationTicket(Base):
    """Persists escalation tickets."""
    __tablename__ = "escalation_tickets"

    ticket_id = Column(String, primary_key=True, index=True)
    issue_id = Column(String, nullable=False)
    reason = Column(Text)
    severity = Column(String)
    status = Column(String, default="open")
    assigned_to = Column(String)
    customer_contact = Column(String)
    estimated_response_time = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class ServiceHistory(Base):
    """
    Logs every elevator fault diagnosis session.

    Captured data is used to:
      - Audit technician interventions
      - Provide real-world feedback to improve knowledge graph confidence weights
      - Power a future reinforcement-learning loop on the graph

    Columns
    -------
    id              Auto-incrementing primary key (UUID string)
    timestamp       UTC datetime of the diagnosis request
    symptom         Raw symptom description / keywords submitted by the caller
    top_cause       Label of the highest-confidence cause returned by query_graph()
    confidence      Edge confidence score for the top cause (0.0 – 1.0)
    resolved        True once a technician marks the diagnosis as correct/resolved;
                    NULL/False means the session is still open or the fix failed
    """
    __tablename__ = "service_history"

    id = Column(String, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    symptom = Column(Text, nullable=False)
    top_cause = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    resolved = Column(Boolean, nullable=True, default=None)


# ---------------------------------------------------------------------------
# Initialise tables
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Create all tables if they don't already exist.

    Tables created:
      - diagnostic_records   – stores LLM diagnostic run outputs
      - escalation_tickets   – stores human-escalation tickets
      - service_history      – logs every elevator fault diagnosis session
    """
    Base.metadata.create_all(bind=engine)
    print("[Database] Tables initialised (SQLite): diagnostic_records, escalation_tickets, service_history.")


# ---------------------------------------------------------------------------
# Dependency for FastAPI endpoints
# ---------------------------------------------------------------------------
def get_db():
    """FastAPI dependency that yields a DB session and closes it after use."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
