from __future__ import annotations

import unittest
from types import SimpleNamespace

from core.routing import WORKFLOW_DEATH_BY_AI_JUDGE, WORKFLOW_SCENARIO_MODERATOR, route_event
from core.workflows import (
    DIED_LABEL,
    NO_SCENARIO_LABEL,
    SURVIVED_LABEL,
    JudgeWorkflow,
    ScenarioModeratorWorkflow,
    extract_player_name,
    extract_response_target,
    verdict_label_from_text,
)


class FakeIssue:
    def __init__(self, number=1, body="", labels=None, title="Issue"):
        self.number = number
        self.body = body
        self.title = title
        self.labels = [SimpleNamespace(name=name) for name in (labels or [])]
        self.comments = []
        self.added_labels = []

    def create_comment(self, body):
        self.comments.append(body)

    def add_to_labels(self, *labels):
        self.added_labels.extend(labels)


class FakeRepo:
    def __init__(self, issues):
        self.issues = issues

    def get_issue(self, number):
        if number not in self.issues:
            raise KeyError(number)
        return self.issues[number]


class FakeGithub:
    def __init__(self, repo):
        self.repo = repo

    def get_repo(self, full_name):
        return self.repo


def payload(label, body="", number=7):
    return {
        "action": "opened",
        "repository": {"full_name": "owner/repo"},
        "installation": {"id": 123},
        "issue": {
            "number": number,
            "title": "Title",
            "body": body,
            "labels": [{"name": label}],
            "user": {"login": "octo", "name": "Octavia"},
        },
    }


class GameWorkflowTests(unittest.TestCase):
    def test_routes_game_labels(self):
        self.assertEqual(route_event("issues", payload("game:scenario")).workflow, WORKFLOW_SCENARIO_MODERATOR)
        self.assertEqual(route_event("issues", payload("game:response")).workflow, WORKFLOW_DEATH_BY_AI_JUDGE)

    def test_response_helpers(self):
        self.assertEqual(extract_response_target("responds-to: #42"), 42)
        self.assertEqual(extract_player_name({"name": "Ada", "login": "octo"}), "Ada")
        self.assertEqual(verdict_label_from_text("Ada wins.\n\n( ❤️ Ada survived )"), SURVIVED_LABEL)
        self.assertEqual(verdict_label_from_text("Ada slips.\n\n( 💀 Ada died )"), DIED_LABEL)

    def test_judge_missing_scenario_skips_dispatch(self):
        issue = FakeIssue(number=7, body="No link")
        dispatch = JudgeWorkflow().build_dispatch(
            payload("game:response", issue.body),
            github_client=FakeGithub(FakeRepo({7: issue})),
        )
        self.assertIsNone(dispatch)
        self.assertIn(NO_SCENARIO_LABEL, issue.added_labels)
        self.assertIn("responds-to", issue.comments[0])

    def test_judge_valid_response_builds_dispatch(self):
        response = FakeIssue(number=7, body="responds-to: #3")
        response.user = SimpleNamespace(name="Ada", login="octo")
        scenario = FakeIssue(number=3, body="Escape the moon.", labels=["game:scenario"])
        dispatch = JudgeWorkflow().build_dispatch(
            payload("game:response", response.body),
            github_client=FakeGithub(FakeRepo({7: response, 3: scenario})),
        )
        self.assertIsNotNone(dispatch)
        self.assertEqual(dispatch.payload_subset["scenario_number"], 3)
        self.assertEqual(dispatch.payload_subset["player_name"], "Ada")

    def test_appliers_label_and_comment(self):
        issue = FakeIssue(number=9)
        repo = FakeRepo({9: issue})
        ScenarioModeratorWorkflow().apply_result(
            repo,
            context={"issue_number": 9},
            run=None,
            result={"verdict": "APPROVED", "comment": "Looks playable."},
            progress=SimpleNamespace(report_success=lambda: None),
        )
        self.assertIn("scenario:approved", issue.added_labels)
        self.assertEqual(issue.comments, ["Looks playable."])


if __name__ == "__main__":
    unittest.main()
