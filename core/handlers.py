from __future__ import annotations

from typing import Mapping

from .poll_runs import WorkflowHandlers
from .workflow_adapters import GithubClientFactory, handlers_for_workflow
from .workflows import build_workflow_registry


def build_handler_registry(
    *, github_client_factory: GithubClientFactory
) -> Mapping[str, WorkflowHandlers]:
    return {
        name: handlers_for_workflow(workflow, github_client_factory=github_client_factory)
        for name, workflow in build_workflow_registry().items()
    }


__all__ = ["GithubClientFactory", "build_handler_registry"]
