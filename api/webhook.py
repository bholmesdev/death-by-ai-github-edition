from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler
from typing import Any, Callable, Mapping

from core.dispatch import DispatchResult, PromptBuilder, dispatch_run, evaluate_route
from core.routing import RouteDecision, route_event
from core.signatures import SIGNATURE_HEADER, SignatureVerificationError, verify_signature
from core.state import StateStore

logger = logging.getLogger(__name__)

_EVENT_HEADER = "x-github-event"
_DELIVERY_HEADER = "x-github-delivery"


@dataclass(frozen=True)
class WebhookResponse:
    status: int
    body: dict[str, Any]


def _resolve_secret() -> str:
    secret = os.environ.get("OZ_GITHUB_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise RuntimeError("OZ_GITHUB_WEBHOOK_SECRET is not configured")
    return secret


def process_webhook_request(
    *,
    body: bytes,
    signature_header: str | None,
    event_header: str | None,
    delivery_id: str | None,
    secret: str,
    builder_registry: Mapping[str, PromptBuilder] | None = None,
    runner: Callable[..., Any] | None = None,
    config_factory: Callable[[str, str], Mapping[str, Any]] | None = None,
    store: StateStore | None = None,
) -> WebhookResponse:
    try:
        verify_signature(secret=secret, body=body, signature_header=signature_header)
    except SignatureVerificationError:
        return WebhookResponse(401, {"error": "invalid signature"})

    if not event_header:
        return WebhookResponse(400, {"error": "missing X-GitHub-Event header"})
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return WebhookResponse(400, {"error": f"invalid JSON body: {exc}"})
    if not isinstance(payload, dict):
        return WebhookResponse(400, {"error": "webhook payload must be an object"})

    decision: RouteDecision = route_event(event_header, payload)
    base_body = {
        "event": event_header.lower(),
        "workflow": decision.workflow,
        "reason": decision.reason,
        "delivery": delivery_id or "",
    }
    if decision.workflow is None:
        return WebhookResponse(202, base_body)
    if builder_registry is None or runner is None or config_factory is None or store is None:
        return WebhookResponse(202, base_body)

    try:
        request = evaluate_route(
            decision=decision,
            payload=payload,
            builder_registry=builder_registry,
        )
        if request is None:
            return WebhookResponse(202, {**base_body, "dispatched": False})
        result: DispatchResult = dispatch_run(
            request=request,
            runner=runner,
            config_factory=config_factory,
            store=store,
        )
    except Exception as exc:
        logger.exception("Failed to dispatch delivery %s", delivery_id)
        return WebhookResponse(500, {**base_body, "error": f"dispatch failed: {exc}"})

    return WebhookResponse(202, {**base_body, "dispatched": True, "run_id": result.run_id})


class handler(BaseHTTPRequestHandler):  # noqa: N801
    server_version = "DeathByAIWebhook/1.0"

    def do_POST(self) -> None:  # noqa: N802
        try:
            secret = _resolve_secret()
            length = int(self.headers.get("content-length", "0") or 0)
            body = self.rfile.read(length) if length > 0 else b""
            wiring = _build_runtime_wiring(body=body)
            response = process_webhook_request(
                body=body,
                signature_header=self.headers.get(SIGNATURE_HEADER),
                event_header=self.headers.get(_EVENT_HEADER),
                delivery_id=self.headers.get(_DELIVERY_HEADER),
                secret=secret,
                builder_registry=wiring["builder_registry"],
                runner=wiring["runner"],
                config_factory=wiring["config_factory"],
                store=wiring["store"],
            )
        except Exception as exc:
            logger.exception("Webhook failed")
            response = WebhookResponse(500, {"error": str(exc)})
        self._respond(response.status, response.body)

    def do_GET(self) -> None:  # noqa: N802
        self._respond(200, {"status": "ok"})

    def _respond(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def _build_runtime_wiring(*, body: bytes) -> dict[str, Any]:
    from pathlib import Path

    import httpx
    from github import Auth, Github
    from oz_agent_sdk import OzAPI

    from api.cron import build_state_store
    from core.builders import build_builder_registry
    from core.github_app import fetch_installation_token
    from oz.oz_client import build_agent_config

    app_id = os.environ["OZ_GITHUB_APP_ID"]
    private_key = os.environ["OZ_GITHUB_APP_PRIVATE_KEY"]
    api_base = os.environ.get("GITHUB_API_BASE_URL", "https://api.github.com")

    class _HttpxClient:
        def post(self, url, *, headers, timeout):
            with httpx.Client(timeout=timeout) as client:
                return client.post(url, headers=headers)

    def _mint_github_client(installation_id: int) -> Github:
        token = fetch_installation_token(
            installation_id=installation_id,
            app_id=app_id,
            private_key=private_key,
            http=_HttpxClient(),
            api_base=api_base,
        )
        return Github(auth=Auth.Token(token.token))

    payload = json.loads(body.decode("utf-8")) if body else {}
    installation_id = int(((payload.get("installation") or {}).get("id")) or 0)
    cached: dict[str, Github] = {}

    def _client_for_payload() -> Github:
        if "client" not in cached:
            cached["client"] = _mint_github_client(installation_id)
        return cached["client"]

    sdk_client = OzAPI(
        api_key=os.environ["WARP_API_KEY"],
        base_url=os.environ["WARP_API_BASE_URL"],
    )

    def runner(*, prompt, title, config, skill, team, attachments=None):
        request = {"prompt": prompt, "title": title, "config": config, "team": team}
        if skill:
            request["skill"] = skill
        if attachments:
            request["attachments"] = tuple(attachments)
        return sdk_client.agent.run(**request)

    def config_factory(config_name: str, role: str) -> Mapping[str, Any]:
        return build_agent_config(config_name=config_name, workspace=Path("/tmp"), role=role)

    return {
        "builder_registry": build_builder_registry(github_client_factory=_client_for_payload),
        "runner": runner,
        "config_factory": config_factory,
        "store": build_state_store(),
    }


__all__ = ["WebhookResponse", "handler", "process_webhook_request"]
