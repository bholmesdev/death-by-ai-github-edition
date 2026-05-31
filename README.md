# Death by AI: GitHub Edition

A live conference party game in the spirit of [Death by AI](https://deathbyai.gg/) — but every input is a real GitHub issue, and the judge is a real cloud agent running on this repo. Doubles as a demo of Oz agents operating on an open-source project.

## How it works

A **scenario** is a survival prompt — *"You're surrounded by 1000 puppies"*. A **response** is your survival plan. The judge agent writes a short cinematic story deciding whether you live or die.

**Before a round:** anyone suggests a scenario via the app or GitHub, and a moderator agent labels it `scenario:approved` or `scenario:rejected`. Only approved scenarios enter the pool.

**During a round (at the event):**

1. The MC clicks "Start game" / "Next round" on the projector. The projector proposes an approved scenario (fewest existing responses first, random tiebreak, skipping used ones). The MC can shuffle to a different scenario from the deck, set the timer duration, then click "Start round".
2. The scenario and a countdown timer show on screen. A QR code links to the app's response form (`/respond/:N`). Attendees fill in their name and survival plan; the app creates the GitHub issue on their behalf.
3. Each response issue triggers the judge agent. It reads the linked scenario and the response, writes a cinematic verdict ending in a footer line like `( ❤️ Jeff survived )` or `( 💀 Jeff died )`, and applies the `verdict:survived` / `verdict:died` label — the projector's "ready to reveal" signal.
4. Timer ends → reveal phase. The projector shows a tile for each response whose verdict is ready (avatar + name visible, story hidden). The MC clicks a tile; the story unfolds sentence-by-sentence with MC presses, ending in the survived/died footer.
5. New verdicts keep popping in during the reveal. When the MC moves to the next round, responses still being judged stay in GitHub but no longer appear on screen.
6. The MC clicks "Next round". Loop.

## Why GitHub issues for everything

- **No database.** Issues, labels, comments, and authors are the durable state. The projector is a pure consumer.
- **Real demo of agents on an open-source repo.** Filing an issue triggers a real Oz cloud agent on a real GitHub App — attendees can click the session link in the agent's progress comment and watch it work.
- **Plays anywhere, even after the conference.** No event-time gating — anyone can still file a response to any scenario forever. Verdicts get generated; they just don't appear on the projector.

## Roles & artifacts

| Thing | What it is in GitHub |
|---|---|
| Scenario | Issue with label `game:scenario`. Body = the prompt. Issue number = round id. |
| Response | Issue with label `game:response`. Body contains `responds-to: #N`, player metadata, and the survival plan. |
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
4. Set env: `OZ_GITHUB_WEBHOOK_SECRET`, `CRON_SECRET`, `OZ_GITHUB_APP_ID`, `OZ_GITHUB_APP_PRIVATE_KEY`, `WARP_API_KEY`, `WARP_API_BASE_URL`, `GITHUB_REPOSITORY=bholmesdev/death-by-ai-github-edition`.
5. Install the GitHub App on this repo with Issues read/write and Metadata read.
6. Set the GitHub App webhook URL to `https://<project>.vercel.app/api/webhook`, content type JSON, secret = `OZ_GITHUB_WEBHOOK_SECRET`, event = Issues.
7. Verify `/api/webhook` responds 200 to GET, `/api/cron` is protected by `CRON_SECRET`, and an issue webhook delivery returns 202.
