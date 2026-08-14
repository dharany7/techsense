"""
Knowledge Graph Service
=======================
Manages TWO graph layers in one NetworkX DiGraph:

1. **Elevator Fault Graph** (primary, loaded from fault_data.json)
   Node types:
     - ``symptom``      – a reportable symptom node
     - ``cause``        – a possible root-cause node
     - ``fix_step``     – an individual repair step node
     - ``part``         – a required spare-part node

   Edge types (relationship attribute):
     - ``SYMPTOM_CAUSE``  – Symptom → Cause  (carries ``confidence`` weight)
     - ``CAUSE_FIX``      – Cause → FixStep  (ordered by ``step_order``)
     - ``CAUSE_PART``     – Cause → Part

2. **Legacy General-Tech Graph** (backward-compat, loaded from seed_graph.json)
   Kept intact so that ``diagnostic_engine.py`` continues to work without
   any changes.

Public API
----------
``query_graph(symptom_keywords)``
    Match keywords against symptom nodes → traverse to causes → return
    ranked list of (cause, confidence, fix_steps, parts) tuples.

``knowledge_graph_service``
    Module-level singleton – import this everywhere.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase + strip punctuation for fuzzy matching."""
    return re.sub(r"[^a-z0-9 ]", " ", text.lower()).strip()


def _keyword_score(symptom_attrs: Dict[str, Any], keywords: List[str]) -> float:
    """
    Return a relevance score in [0, 1] for how well *keywords* match a
    symptom node.  Uses keyword-in-text overlap over the union of the
    symptom label and its keyword list.
    """
    label_tokens = set(_normalise(symptom_attrs.get("label", "")).split())
    kw_tokens: set[str] = set()
    for kw in symptom_attrs.get("symptom_keywords", []):
        kw_tokens.update(_normalise(kw).split())
    all_tokens = label_tokens | kw_tokens

    if not all_tokens:
        return 0.0

    query_tokens = set()
    for kw in keywords:
        query_tokens.update(_normalise(kw).split())

    if not query_tokens:
        return 0.0

    matches = query_tokens & all_tokens
    # Jaccard-like: hits / union of *query* tokens (so partial matches still score)
    return len(matches) / len(query_tokens)


# ---------------------------------------------------------------------------
# Main service class
# ---------------------------------------------------------------------------

class KnowledgeGraphService:
    """
    In-memory knowledge graph backed by NetworkX.

    Nodes represent:
      - elevator symptoms / causes / fix-steps / parts  (elevator domain)
      - general tech issues / solutions / OS / error-codes (legacy domain)

    Edges carry typed ``relationship`` and ``weight``/``confidence``
    attributes.
    """

    def __init__(self) -> None:
        self.graph: nx.DiGraph = nx.DiGraph()
        self._load_elevator_fault_data()
        self._load_legacy_seed_data()

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def _fault_data_path(self) -> str:
        return os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "data", "fault_data.json")
        )

    def _seed_data_path(self) -> str:
        return os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "data", "seed_graph.json")
        )

    def _load_elevator_fault_data(self) -> None:
        """
        Build the elevator fault sub-graph from fault_data.json.

        Graph structure per fault:
          symptom_<id>  --[SYMPTOM_CAUSE, confidence=C]--> cause_<id>
          cause_<id>    --[CAUSE_FIX, step_order=N]------> fix_<cause_id>_<N>
          cause_<id>    --[CAUSE_PART, order=N]-----------> part_<cause_id>_<N>
        """
        path = self._fault_data_path()
        if not os.path.exists(path):
            print(f"[KnowledgeGraph] fault_data.json not found at {path}; elevator graph empty.")
            return

        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            print(f"[KnowledgeGraph] Could not load fault_data.json: {exc}")
            return

        for fault in data.get("faults", []):
            symptom_id = f"symptom_{fault['id']}"
            self.graph.add_node(
                symptom_id,
                type="symptom",
                label=fault["symptom"],
                symptom_keywords=fault.get("symptom_keywords", []),
                fault_id=fault["id"],
            )

            for cause in fault.get("causes", []):
                cause_id = f"cause_{cause['id']}"
                self.graph.add_node(
                    cause_id,
                    type="cause",
                    label=cause["label"],
                    confidence=cause.get("confidence", 0.5),
                )

                # Symptom → Cause edge (with confidence weight)
                self.graph.add_edge(
                    symptom_id,
                    cause_id,
                    relationship="SYMPTOM_CAUSE",
                    weight=cause.get("confidence", 0.5),
                    confidence=cause.get("confidence", 0.5),
                )

                # Cause → FixStep nodes
                for step_order, step_text in enumerate(cause.get("fix_steps", []), start=1):
                    step_id = f"fix_{cause['id']}_{step_order}"
                    self.graph.add_node(
                        step_id,
                        type="fix_step",
                        label=step_text,
                        step_order=step_order,
                    )
                    self.graph.add_edge(
                        cause_id,
                        step_id,
                        relationship="CAUSE_FIX",
                        weight=1.0,
                        step_order=step_order,
                    )

                # Cause → RequiredPart nodes
                for part_order, part_name in enumerate(cause.get("required_parts", []), start=1):
                    part_id = f"part_{cause['id']}_{part_order}"
                    self.graph.add_node(
                        part_id,
                        type="part",
                        label=part_name,
                    )
                    self.graph.add_edge(
                        cause_id,
                        part_id,
                        relationship="CAUSE_PART",
                        weight=1.0,
                        order=part_order,
                    )

        print(
            f"[KnowledgeGraph] Elevator fault graph loaded — "
            f"{self.graph.number_of_nodes()} nodes, "
            f"{self.graph.number_of_edges()} edges."
        )

    def _load_legacy_seed_data(self) -> None:
        """
        Load the original seed_graph.json (general tech issues).
        Nodes / edges are added on top of the elevator graph; IDs in that
        file use plain names that do not clash with the ``symptom_/cause_``
        prefixes used above.
        """
        path = self._seed_data_path()
        if not os.path.exists(path):
            self._add_default_nodes()
            return
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            for node in data.get("nodes", []):
                self.graph.add_node(node["id"], **node.get("metadata", {}))
            for edge in data.get("edges", []):
                self.graph.add_edge(
                    edge["source"],
                    edge["target"],
                    relationship=edge.get("relationship", "RELATED_TO"),
                    weight=edge.get("weight", 1.0),
                )
        except Exception as exc:
            print(f"[KnowledgeGraph] Warning – could not load seed_graph.json: {exc}")
            self._add_default_nodes()

    def _add_default_nodes(self) -> None:
        """Bootstrap graph with a handful of well-known tech issues."""
        defaults = [
            ("wifi_disconnecting",  {"label": "WiFi keeps disconnecting",  "type": "issue"}),
            ("slow_performance",    {"label": "Slow system performance",    "type": "issue"}),
            ("blue_screen_error",   {"label": "Blue Screen of Death",       "type": "issue"}),
            ("battery_drain",       {"label": "Fast battery drain",         "type": "issue"}),
            ("driver_update",       {"label": "Update device drivers",      "type": "solution"}),
            ("restart_router",      {"label": "Restart the router",         "type": "solution"}),
            ("clear_cache",         {"label": "Clear system cache",         "type": "solution"}),
        ]
        for node_id, attrs in defaults:
            self.graph.add_node(node_id, **attrs)

        default_edges = [
            ("wifi_disconnecting", "restart_router",   "RESOLVES"),
            ("wifi_disconnecting", "driver_update",    "RESOLVES"),
            ("slow_performance",   "clear_cache",      "RESOLVES"),
            ("blue_screen_error",  "driver_update",    "RESOLVES"),
            ("wifi_disconnecting", "slow_performance", "RELATED_TO"),
        ]
        for src, tgt, rel in default_edges:
            self.graph.add_edge(src, tgt, relationship=rel, weight=1.0)

    # ------------------------------------------------------------------
    # Primary public API – elevator fault query
    # ------------------------------------------------------------------

    def query_graph(
        self,
        symptom_keywords: List[str],
    ) -> List[Tuple[str, float, List[str], List[str]]]:
        """
        Match *symptom_keywords* against symptom nodes and traverse the graph
        to return ranked diagnosis results.

        Parameters
        ----------
        symptom_keywords : list[str]
            Free-text keywords describing the observed symptom(s).

        Returns
        -------
        list of (cause_label, confidence, fix_steps, required_parts)
            Sorted by confidence descending.  Each tuple:

            * ``cause_label``    – human-readable cause description
            * ``confidence``     – float [0, 1], edge weight on Symptom→Cause
            * ``fix_steps``      – ordered list of repair instruction strings
            * ``required_parts`` – list of spare-part name strings
        """
        if not symptom_keywords:
            return []

        # --- 1. Score every symptom node against the query keywords --------
        symptom_scores: List[Tuple[str, float]] = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") != "symptom":
                continue
            score = _keyword_score(attrs, symptom_keywords)
            if score > 0.0:
                symptom_scores.append((node_id, score))

        if not symptom_scores:
            return []

        # --- 2. For each matching symptom, traverse to causes --------------
        results: Dict[str, Tuple[float, List[str], List[str]]] = {}

        for symptom_id, kw_score in symptom_scores:
            for _, cause_id, edge_data in self.graph.out_edges(symptom_id, data=True):
                if edge_data.get("relationship") != "SYMPTOM_CAUSE":
                    continue

                # Combined confidence: edge confidence × keyword match score
                # (keyword score acts as a relevance discount)
                raw_conf: float = edge_data.get("confidence", edge_data.get("weight", 0.5))
                combined_conf = raw_conf * kw_score

                if cause_id in results:
                    # Keep the highest combined confidence seen for this cause
                    existing_conf, existing_steps, existing_parts = results[cause_id]
                    if combined_conf <= existing_conf:
                        continue

                cause_attrs = self.graph.nodes.get(cause_id, {})

                # Collect ordered fix steps
                fix_steps = self._get_ordered_fix_steps(cause_id)

                # Collect required parts
                required_parts = self._get_required_parts(cause_id)

                results[cause_id] = (combined_conf, fix_steps, required_parts)

        # --- 3. Build and sort output list ---------------------------------
        output: List[Tuple[str, float, List[str], List[str]]] = []
        for cause_id, (conf, steps, parts) in results.items():
            cause_label = self.graph.nodes[cause_id].get("label", cause_id)
            output.append((cause_label, round(conf, 4), steps, parts))

        output.sort(key=lambda t: t[1], reverse=True)
        return output

    def _get_ordered_fix_steps(self, cause_id: str) -> List[str]:
        """Return fix step texts in step_order for a given cause node."""
        step_edges = [
            (data.get("step_order", 999), target)
            for _, target, data in self.graph.out_edges(cause_id, data=True)
            if data.get("relationship") == "CAUSE_FIX"
        ]
        step_edges.sort(key=lambda t: t[0])
        return [
            self.graph.nodes[step_id].get("label", step_id)
            for _, step_id in step_edges
        ]

    def _get_required_parts(self, cause_id: str) -> List[str]:
        """Return required part names for a given cause node."""
        part_edges = [
            (data.get("order", 999), target)
            for _, target, data in self.graph.out_edges(cause_id, data=True)
            if data.get("relationship") == "CAUSE_PART"
        ]
        part_edges.sort(key=lambda t: t[0])
        return [
            self.graph.nodes[part_id].get("label", part_id)
            for _, part_id in part_edges
        ]

    # ------------------------------------------------------------------
    # Legacy CRUD helpers (used by diagnostic_engine.py)
    # ------------------------------------------------------------------

    def add_node(self, node_id: str, **attrs) -> None:
        self.graph.add_node(node_id, **attrs)

    def add_edge(
        self,
        source: str,
        target: str,
        relationship: str = "RELATED_TO",
        weight: float = 1.0,
    ) -> None:
        self.graph.add_edge(source, target, relationship=relationship, weight=weight)

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        if node_id not in self.graph:
            return None
        return {"id": node_id, **self.graph.nodes[node_id]}

    def get_related_nodes(self, node_id: str, depth: int = 2) -> List[Dict[str, Any]]:
        """BFS up to *depth* hops away from node_id."""
        if node_id not in self.graph:
            return []
        reachable = nx.single_source_shortest_path_length(
            self.graph, node_id, cutoff=depth
        )
        return [
            {"id": nid, **self.graph.nodes[nid]}
            for nid in reachable
            if nid != node_id
        ]

    def get_solutions_for_issue(self, issue_id: str) -> List[Dict[str, Any]]:
        """Return nodes reachable via RESOLVES edges (legacy general-tech API)."""
        if issue_id not in self.graph:
            return []
        return [
            {"id": target, **self.graph.nodes.get(target, {})}
            for _, target, data in self.graph.out_edges(issue_id, data=True)
            if data.get("relationship") == "RESOLVES"
        ]

    def get_full_graph(self) -> Dict[str, Any]:
        nodes = [{"id": n, **self.graph.nodes[n]} for n in self.graph.nodes]
        edges = [
            {"source": u, "target": v, **data}
            for u, v, data in self.graph.edges(data=True)
        ]
        return {"nodes": nodes, "edges": edges}

    def search_nodes(self, query: str) -> List[Dict[str, Any]]:
        """Simple label-based fuzzy search (used by diagnostic_engine)."""
        query_lower = query.lower()
        results = []
        for node_id, attrs in self.graph.nodes(data=True):
            label = attrs.get("label", node_id)
            if query_lower in label.lower() or query_lower in node_id.lower():
                results.append({"id": node_id, **attrs})
        return results

    # ------------------------------------------------------------------
    # Graph metrics
    # ------------------------------------------------------------------

    @property
    def node_count(self) -> int:
        return self.graph.number_of_nodes()

    @property
    def edge_count(self) -> int:
        return self.graph.number_of_edges()


# ---------------------------------------------------------------------------
# Module-level singleton – import this in routers / other services
# ---------------------------------------------------------------------------
knowledge_graph_service = KnowledgeGraphService()


# ---------------------------------------------------------------------------
# Convenience top-level function (matches the spec exactly)
# ---------------------------------------------------------------------------

def query_graph(symptom_keywords: List[str]) -> List[Tuple[str, float, List[str], List[str]]]:
    """
    Module-level shortcut for ``knowledge_graph_service.query_graph()``.

    Parameters
    ----------
    symptom_keywords : list[str]
        Free-text keywords describing the observed elevator symptom(s).

    Returns
    -------
    list of (cause_label, confidence, fix_steps, required_parts)
        Sorted by confidence descending.
    """
    return knowledge_graph_service.query_graph(symptom_keywords)


# ---------------------------------------------------------------------------
# Service-history logger – persists every diagnosis session to SQLite
# ---------------------------------------------------------------------------

def log_diagnosis_session(
    symptom: str,
    top_cause: Optional[str],
    confidence: Optional[float],
    resolved: Optional[bool] = None,
) -> str:
    """
    Persist one elevator fault diagnosis session to the ``service_history``
    SQLite table.

    Parameters
    ----------
    symptom : str
        The raw symptom text or comma-joined keyword list submitted by the
        caller (e.g. ``"door not closing, motor hum"``).
    top_cause : str or None
        Human-readable label of the highest-confidence cause returned by
        ``query_graph()``.  Pass ``None`` when no cause was matched.
    confidence : float or None
        The combined confidence score (0.0 – 1.0) for *top_cause*.
        Pass ``None`` when no cause was matched.
    resolved : bool or None
        ``True``  – technician confirmed the diagnosis was correct.
        ``False`` – the suggested fix did not resolve the issue.
        ``None``  – session is still open / outcome not yet known (default).

    Returns
    -------
    str
        The UUID of the newly created ``service_history`` row.

    Notes
    -----
    Failures are logged but **never re-raised** so that a DB problem can
    never crash the diagnosis API.
    """
    import uuid
    from datetime import datetime

    try:
        from app.db.database import SessionLocal, ServiceHistory  # local import to avoid circular deps

        session_id = str(uuid.uuid4())
        record = ServiceHistory(
            id=session_id,
            timestamp=datetime.utcnow(),
            symptom=symptom,
            top_cause=top_cause,
            confidence=confidence,
            resolved=resolved,
        )
        db = SessionLocal()
        try:
            db.add(record)
            db.commit()
            print(
                f"[KnowledgeGraph] ServiceHistory logged: id={session_id} "
                f"symptom='{symptom[:60]}' top_cause='{top_cause}' "
                f"confidence={confidence} resolved={resolved}"
            )
        finally:
            db.close()

        return session_id

    except Exception as exc:  # pragma: no cover
        print(f"[KnowledgeGraph] WARNING – could not log service_history: {exc}")
        return ""

