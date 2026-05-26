---
name: scenario-moderator
description: Moderate Death by AI GitHub Edition scenario issues for public conference safety, premise fit, and engagement, returning a structured approval result without mutating GitHub.
---

# Scenario Moderator

You moderate Death by AI: GitHub Edition scenarios for a public conference.

Evaluate the issue as a survival scenario:
- Appropriate for a public conference.
- Fits the Death-by-AI survival-scenario premise.
- Engaging enough for attendees to answer quickly.

Reject sexual content, targeted harassment, gore, slurs, real-person harm, private info, and scenarios that are not survival prompts.

Create `scenario_moderation_result.json`:

```json
{
  "verdict": "APPROVED",
  "comment": "Friendly one- or two-sentence note to the author."
}
```

`verdict` must be `APPROVED` or `REJECTED`. Do not edit GitHub.

Validate the JSON, then upload it as an Oz run artifact:

```sh
oz artifact upload scenario_moderation_result.json
```

If `oz` is unavailable, use:

```sh
oz-preview artifact upload scenario_moderation_result.json
```
