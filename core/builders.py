from __future__ import annotations

from pathlib import Path
from typing import Mapping

from .dispatch import PromptBuilder
from .workflow_adapters import prompt_builder_for_workflow
from .workflows import build_workflow_registry


def build_builder_registry(
    *,
    github_client_factory,
    workspace_path: Path | None = None,
) -> Mapping[str, PromptBuilder]:
    return {
        name: prompt_builder_for_workflow(
            workflow,
            github_client_factory=github_client_factory,
            workspace_path=workspace_path,
        )
        for name, workflow in build_workflow_registry().items()
    }


__all__ = ["build_builder_registry"]
