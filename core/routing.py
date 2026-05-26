from __future__ import annotations

from dataclasses import dataclass
from typing import Any

WORKFLOW_SCENARIO_MODERATOR = "scenario-moderator"
WORKFLOW_DEATH_BY_AI_JUDGE = "death-by-ai-judge"

GAME_SCENARIO_LABEL = "game:scenario"
GAME_RESPONSE_LABEL = "game:response"


@dataclass(frozen=True)
class RouteDecision:
    workflow: str | None
    reason: str
    extra: dict[str, Any] | None = None


def _label_names(labels: Any) -> list[str]:
    if not isinstance(labels, list):
        return []
    names: list[str] = []
    for label in labels:
        name = label.get("name") if isinstance(label, dict) else getattr(label, "name", None)
        if isinstance(name, str) and name.strip():
            names.append(name.strip())
    return names


def _is_bot(actor: Any) -> bool:
    if isinstance(actor, dict):
        user_type = str(actor.get("type") or "").lower()
        login = str(actor.get("login") or "").lower()
    else:
        user_type = str(getattr(actor, "type", "") or "").lower()
        login = str(getattr(actor, "login", "") or "").lower()
    return user_type == "bot" or login.endswith("[bot]")


def route_event(event: str, payload: dict[str, Any]) -> RouteDecision:
    event = (event or "").strip().lower()
    if event != "issues":
        return RouteDecision(None, f"event {event!r} not handled")
    if str(payload.get("action") or "") != "opened":
        return RouteDecision(None, "issues action not opened")
    issue = payload.get("issue") or {}
    if not isinstance(issue, dict):
        return RouteDecision(None, "missing issue payload")
    if issue.get("pull_request"):
        return RouteDecision(None, "pull requests not part of game")
    if _is_bot(issue.get("user") or payload.get("sender")):
        return RouteDecision(None, "issue authored by automation user")

    labels = _label_names(issue.get("labels"))
    if GAME_SCENARIO_LABEL in labels:
        return RouteDecision(WORKFLOW_SCENARIO_MODERATOR, "new scenario issue")
    if GAME_RESPONSE_LABEL in labels:
        return RouteDecision(WORKFLOW_DEATH_BY_AI_JUDGE, "new response issue")
    return RouteDecision(None, "issue missing game label")


__all__ = [
    "GAME_RESPONSE_LABEL",
    "GAME_SCENARIO_LABEL",
    "RouteDecision",
    "WORKFLOW_DEATH_BY_AI_JUDGE",
    "WORKFLOW_SCENARIO_MODERATOR",
    "route_event",
]
