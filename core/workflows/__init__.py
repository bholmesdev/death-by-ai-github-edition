from __future__ import annotations

import re
from typing import Any, Mapping

from core.routing import (
    GAME_SCENARIO_LABEL,
    WORKFLOW_DEATH_BY_AI_JUDGE,
    WORKFLOW_SCENARIO_MODERATOR,
)
from core.state import RunState
from core.workflow_adapters import reconstruct_progress
from oz.agent_workflow import ProgressCommentSpec, WorkflowDispatch, make_run_adapter

APPROVED_LABEL = "scenario:approved"
REJECTED_LABEL = "scenario:rejected"
NO_SCENARIO_LABEL = "error:no-scenario"
SURVIVED_LABEL = "verdict:survived"
DIED_LABEL = "verdict:died"
SCENARIO_TERMINAL_LABELS = frozenset({APPROVED_LABEL, REJECTED_LABEL})
JUDGE_TERMINAL_LABELS = frozenset({SURVIVED_LABEL, DIED_LABEL, NO_SCENARIO_LABEL})

RESPONDS_TO_RE = re.compile(
    r"responds-to:\s*#?(\d+)|###\s*Scenario\s*\n+\s*#?(\d+)",
    re.IGNORECASE,
)
PLAYER_NAME_RE = re.compile(
    r"^player-name:\s*(.+)$|^###\s*Player\s*\n+([\s\S]*?)(?=\n###\s|$)",
    re.IGNORECASE | re.MULTILINE,
)

def _owner_repo(payload: Mapping[str, Any]) -> tuple[str, str, str]:
    full_name = str(((payload.get("repository") or {}).get("full_name")) or "")
    if "/" not in full_name:
        raise ValueError("payload.repository.full_name must be owner/repo")
    owner, repo = full_name.split("/", 1)
    return owner, repo, full_name


def _installation_id(payload: Mapping[str, Any]) -> int:
    value = int(((payload.get("installation") or {}).get("id")) or 0)
    if value <= 0:
        raise ValueError("payload.installation.id missing")
    return value


def _issue(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    issue = payload.get("issue")
    if not isinstance(issue, dict):
        raise ValueError("payload.issue missing")
    return issue


def _labels(issue: Any) -> list[str]:
    labels = getattr(issue, "labels", None)
    if labels is None and isinstance(issue, dict):
        labels = issue.get("labels")
    out: list[str] = []
    for label in labels or []:
        name = label.get("name") if isinstance(label, dict) else getattr(label, "name", "")
        if name:
            out.append(str(name))
    return out


def extract_response_target(body: str) -> int | None:
    match = RESPONDS_TO_RE.search(body or "")
    if not match:
        return None
    value = match.group(1) or match.group(2)
    return int(value)


def extract_player_name(user: Any | None = None) -> str:
    if isinstance(user, dict):
        name = user.get("name")
        login = user.get("login")
    else:
        name = getattr(user, "name", None)
        login = getattr(user, "login", None)
    return str(name or login or "Player").strip()


def extract_player_name_from_body(body: str, user: Any | None = None) -> str:
    match = PLAYER_NAME_RE.search(body or "")
    if match:
        name = (match.group(1) or match.group(2) or "").strip()
        if name:
            return name
    return extract_player_name(user)


def verdict_label_from_text(text: str) -> str:
    footer = (text or "").strip().splitlines()[-1] if (text or "").strip() else ""
    if re.search(r"\bsurvived\b", footer, re.IGNORECASE):
        return SURVIVED_LABEL
    if re.search(r"\bdied\b", footer, re.IGNORECASE):
        return DIED_LABEL
    raise ValueError("verdict footer must include survived or died")


def _comment(result: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


class BaseGameWorkflow:
    workflow: str
    skill_name: str
    artifact_name: str
    config_name = "death-by-ai"
    terminal_labels: frozenset[str] = frozenset()

    def load_artifact(self, run_id: str) -> dict[str, Any]:
        from oz.artifacts import poll_for_artifact

        return poll_for_artifact(run_id, filename=self.artifact_name)

    def progress_for_state(self, repo_handle: Any, *, state: RunState) -> Any:
        return reconstruct_progress(repo_handle, state=state, workflow=self.workflow)

    def run_adapter_for_state(self, *, state: RunState, progress: Any, run: Any | None = None) -> Any:
        return make_run_adapter(state=state, progress=progress, run=run)

    def _dispatch(
        self,
        payload: Mapping[str, Any],
        *,
        repo_handle: Any,
        issue_number: int,
        title: str,
        prompt: str,
        subset: dict[str, Any],
        requester: str,
        start_line: str,
    ) -> WorkflowDispatch:
        owner, repo, full_name = _owner_repo(payload)
        return WorkflowDispatch(
            workflow=self.workflow,
            repo=full_name,
            installation_id=_installation_id(payload),
            config_name=self.config_name,
            title=title,
            skill_name=self.skill_name,
            prompt=prompt,
            payload_subset={"issue_number": issue_number, "requester": requester, **subset},
            progress=ProgressCommentSpec(
                repo_handle=repo_handle,
                owner=owner,
                repo=repo,
                issue_number=issue_number,
                workflow=self.workflow,
                start_line=start_line,
                requester_login=requester,
                event_payload=payload,
            ),
        )

    def is_complete(self, repo_handle: Any, *, context: Mapping[str, Any]) -> bool:
        if not self.terminal_labels:
            return False
        issue_number = int(context.get("issue_number") or 0)
        if issue_number <= 0:
            return False
        issue = repo_handle.get_issue(issue_number)
        return bool(self.terminal_labels.intersection(_labels(issue)))


class ScenarioModeratorWorkflow(BaseGameWorkflow):
    workflow = WORKFLOW_SCENARIO_MODERATOR
    skill_name = "scenario-moderator"
    artifact_name = "scenario_moderation_result.json"
    terminal_labels = SCENARIO_TERMINAL_LABELS

    def build_dispatch(self, payload: Mapping[str, Any], *, github_client: Any, workspace_path: Any = None) -> WorkflowDispatch:
        issue = _issue(payload)
        if self.terminal_labels.intersection(_labels(issue)):
            return None
        issue_number = int(issue.get("number") or 0)
        user = issue.get("user") or {}
        owner, repo, full_name = _owner_repo(payload)
        repo_handle = github_client.get_repo(full_name)
        prompt = (
            f"Moderate GitHub issue #{issue_number} in {owner}/{repo} as a Death by AI scenario.\n\n"
            f"Title: {issue.get('title') or ''}\n\nBody:\n{issue.get('body') or ''}\n\n"
            "Create scenario_moderation_result.json with keys verdict and comment. "
            "verdict must be APPROVED or REJECTED. Do not post comments or labels."
        )
        return self._dispatch(
            payload,
            repo_handle=repo_handle,
            issue_number=issue_number,
            title=f"Moderate scenario #{issue_number}",
            prompt=prompt,
            subset={},
            requester=str((user.get("login") if isinstance(user, dict) else getattr(user, "login", "")) or ""),
            start_line="Moderating this scenario for the game.",
        )

    def apply_result(self, repo_handle: Any, *, context: Mapping[str, Any], run: Any, result: Mapping[str, Any], progress: Any, github_client: Any | None = None) -> None:
        issue = repo_handle.get_issue(int(context["issue_number"]))
        verdict = str(result.get("verdict") or "").strip().upper()
        label = APPROVED_LABEL if verdict == "APPROVED" else REJECTED_LABEL
        issue.add_to_labels(label)
        body = _comment(result, "comment", "body") or "Thanks for the scenario. The moderator reviewed it."
        issue.create_comment(body)
        progress.complete("Scenario moderation complete.")


class JudgeWorkflow(BaseGameWorkflow):
    workflow = WORKFLOW_DEATH_BY_AI_JUDGE
    skill_name = "death-by-ai-judge"
    artifact_name = "verdict_result.json"
    terminal_labels = JUDGE_TERMINAL_LABELS

    def build_dispatch(self, payload: Mapping[str, Any], *, github_client: Any, workspace_path: Any = None) -> WorkflowDispatch | None:
        issue = _issue(payload)
        if self.terminal_labels.intersection(_labels(issue)):
            return None
        issue_number = int(issue.get("number") or 0)
        body = str(issue.get("body") or "")
        target_number = extract_response_target(body)
        owner, repo, full_name = _owner_repo(payload)
        repo_handle = github_client.get_repo(full_name)
        response_issue = repo_handle.get_issue(issue_number)
        if target_number is None:
            self._reject_missing_scenario(response_issue)
            return None
        try:
            scenario = repo_handle.get_issue(target_number)
        except Exception:
            self._reject_missing_scenario(response_issue)
            return None
        if GAME_SCENARIO_LABEL not in _labels(scenario):
            self._reject_missing_scenario(response_issue)
            return None

        user = getattr(response_issue, "user", None) or issue.get("user") or {}
        player_name = extract_player_name_from_body(body, user)
        prompt = (
            f"Judge response issue #{issue_number} in {owner}/{repo}.\n\n"
            f"Player: {player_name}\n"
            f"Scenario issue #{target_number}: {getattr(scenario, 'title', '')}\n"
            f"Scenario body:\n{getattr(scenario, 'body', '') or ''}\n\n"
            f"Response body:\n{body}\n\n"
            "Create verdict_result.json with key verdict_comment. Do not post comments or labels."
        )
        return self._dispatch(
            payload,
            repo_handle=repo_handle,
            issue_number=issue_number,
            title=f"Judge response #{issue_number}",
            prompt=prompt,
            subset={"scenario_number": target_number, "player_name": player_name},
            requester=str((user.get("login") if isinstance(user, dict) else getattr(user, "login", "")) or ""),
            start_line="Judging this survival plan.",
        )

    def _reject_missing_scenario(self, issue: Any) -> None:
        issue.add_to_labels(NO_SCENARIO_LABEL)
        issue.create_comment(
            "I could not find a valid scenario link. Add a line like `responds-to: #123` "
            "pointing at a `game:scenario` issue, then file a new response."
        )

    def apply_result(self, repo_handle: Any, *, context: Mapping[str, Any], run: Any, result: Mapping[str, Any], progress: Any, github_client: Any | None = None) -> None:
        issue = repo_handle.get_issue(int(context["issue_number"]))
        comment = _comment(result, "verdict_comment", "comment", "body")
        if not comment:
            raise ValueError("verdict_result.json missing verdict_comment")
        issue.create_comment(comment)
        issue.add_to_labels(verdict_label_from_text(comment))
        progress.complete("Verdict posted.")


def build_workflow_registry() -> dict[str, BaseGameWorkflow]:
    return {
        WORKFLOW_SCENARIO_MODERATOR: ScenarioModeratorWorkflow(),
        WORKFLOW_DEATH_BY_AI_JUDGE: JudgeWorkflow(),
    }


__all__ = [
    "JudgeWorkflow",
    "ScenarioModeratorWorkflow",
    "build_workflow_registry",
    "extract_player_name",
    "extract_player_name_from_body",
    "extract_response_target",
    "verdict_label_from_text",
]
