# Death by AI: GitHub Edition

A live conference party game in the spirit of [Death by AI](https://deathbyai.gg/) — but every input is a real GitHub issue, and the judge is a real cloud agent running on this repo. Doubles as a demo of Oz agents operating on an open-source project.

## How it works

A **scenario** is a survival prompt — *"You're surrounded by 1000 puppies"*. A **response** is your survival plan. The judge agent writes a short cinematic story deciding whether you live or die.

```
                           ┌───────────────────────────────────────┐
                           │  Anyone suggests a scenario via the   │
                           │  app or GitHub → moderator agent      │
                           │  labels it scenario:approved/rejected │
                           └────────────────┬──────────────────────┘
                                            │
                                            ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ ROUND (during the event)                                         │
   │                                                                  │
   │  1. MC clicks "Start game" / "Next round" on the projector.      │
   │     Projector proposes an approved scenario (fewest existing     │
   │     responses first, random tiebreak, skipping used ones).       │
   │     MC can shuffle to a different scenario from the deck,        │
   │     set the timer duration, then click "Start round".            │
   │                                                                  │
   │  2. Scenario and a countdown timer show on screen. A QR code     │
   │     links to the app's response form (/respond/:N). Attendees    │
   │     fill in their name and survival plan; the app creates the    │
   │     GitHub issue on their behalf.                                │
   │                                                                  │
   │  3. Each response issue triggers the judge agent. The agent      │
   │     reads the linked scenario + the response, writes a 3-5       │
   │     sentence cinematic verdict ending in a footer line like      │
   │     `( ❤️  Jeff survived )` or `( 💀 Jeff died )`,                │
   │     and applies the `verdict:survived` / `verdict:died` label.   │
   │     The label is the projector's "ready to reveal" signal.       │
   │                                                                  │
   │  4. Timer ends → REVEAL phase. Projector shows a tile for each   │
   │     response whose verdict is ready (avatar + name visible,      │
   │     story hidden). MC clicks a tile; the story unfolds           │
   │     sentence-by-sentence with MC presses, ending in the          │
   │     survived/died footer.                                        │
   │                                                                  │
   │  5. Late verdicts pop in during reveal. Verdicts that land       │
   │     after MC advances become "stragglers" in the next round's    │
   │     reveal. Anything older orphans (lives in GitHub forever).    │
   │                                                                  │
   │  6. MC clicks "next round". Loop.                                │
   └──────────────────────────────────────────────────────────────────┘
```

## Why GitHub issues for everything

- **No database.** Issues, labels, comments, and authors are the durable state. The projector is a pure consumer.
- **Real demo of agents on an open-source repo.** Filing an issue triggers a real Oz cloud agent on a real GitHub App — attendees can click the session link in the agent's progress comment and watch it work.
- **Plays anywhere, even after the conference.** No event-time gating — anyone can still file a response to any scenario forever. Verdicts get generated; they just don't appear on the projector.

## Roles & artifacts

| Thing | What it is in GitHub |
|---|---|
| Scenario | Issue with label `game:scenario`. Body = the prompt. Issue number = round id. |
| Response | Issue with label `game:response`. Body contains `responds-to: #N`. Author = the player. |
| Verdict | Single comment on the response issue + `verdict:survived` or `verdict:died` label. |
| Moderation outcome | `scenario:approved` or `scenario:rejected` label, plus a friendly bot comment. |
| Agent run | A "progress comment" on the issue containing the Oz cloud-run session link. |

## App routes

| Route | Purpose |
|---|---|
| `/` | MC projector UI (game state machine) |
| `/respond/:N` | Player response form for scenario `#N` — QR code target during a round |
| `/suggest` | Scenario suggestion form — shown between rounds and on the idle screen |

## Deploy

Vercel setup:

1. Create/import one Vercel project for this repo.
2. Ensure install uses `pnpm install` and build uses `pnpm build`.
3. Add Vercel KV or Upstash Redis env: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
4. Set env: `OZ_GITHUB_WEBHOOK_SECRET`, `CRON_SECRET`, `OZ_GITHUB_APP_ID`, `OZ_GITHUB_APP_PRIVATE_KEY`, `WARP_API_KEY`, `WARP_API_BASE_URL`, `WORKFLOW_CODE_REPOSITORY=warpdotdev-demos/death-by-ai-github-edition`.
5. Install the GitHub App on this repo with Issues read/write and Metadata read.
6. Set the GitHub App webhook URL to `https://<project>.vercel.app/api/webhook`, content type JSON, secret = `OZ_GITHUB_WEBHOOK_SECRET`, event = Issues.
7. Verify `/api/webhook` responds 200 to GET, `/api/cron` is protected by `CRON_SECRET`, and an issue webhook delivery returns 202.
