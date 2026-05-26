# Context

Death by AI: GitHub Edition — a live game played at a conference welcome reception. Attendees submit survival responses by filing GitHub issues; custom Oz cloud agents review the prompt and write a story deciding whether each response survives. A projector layer (this repo) visualizes the game live during the event. Doubles as a demo of agents operating on an open-source repository.

## Components (single repo)

Everything lives in this repo, deployed as one Vercel project:

- **Game state** — Scenarios and responses are GitHub issues filed against this repo. The Oz GitHub App is installed on this repo and delivers webhooks to our control plane.
- **Agent control plane** — Python serverless functions under `api/` (`webhook.py`, `cron.py`) ported from `warpdotdev/oz-for-oss`. Two custom skills under `.agents/skills/`: `scenario-moderator` and `death-by-ai-judge`, with workflow classes under `core/workflows/`.
- **Projector** — React Router app rendering the live game on a TV during the event. Polls this repo's own GitHub API for state. Optional in principle (the game is fully playable on github.com without it); required for the live conference experience.

## Glossary

**Scenario** — A GitHub issue with the `game:scenario` label. The issue number is the canonical round id. Body contains the prompt (e.g. "You're surrounded by 1000 puppies"). Any participant can author one. On creation, the scenario moderator runs and applies `scenario:approved` or `scenario:rejected`.

**Scenario moderator** — A custom Oz skill (in the forked oz-for-oss) that runs on `game:scenario` issue creation, decides whether the scenario is appropriate and engaging enough to use, and applies `scenario:approved` or `scenario:rejected`. Only `scenario:approved` issues enter the selection pool.

**Response** — A GitHub issue with the `game:response` label whose body contains a `responds-to: #N` line pointing at a scenario issue. The link is required; the judge workflow rejects responses without a valid scenario link. Authored by a participant (their GitHub identity is durable). Created via a QR-code deep link to GitHub's new-issue page with the body and labels pre-filled.

**Response** — A GitHub issue with the `game:response` label whose body contains a `responds-to: #N` line pointing at a scenario issue. Authored by a participant (their GitHub identity is durable). Created via a QR-code deep link to GitHub's new-issue page with the body and labels pre-filled.

**Round** — The lifecycle of a single scenario inside a game: open for submissions (60s–2min) → reveal → ended. The scenario issue is the round's identity; there is no separate round entity. When a round opens, the projector picks a scenario via the selection algorithm (see below). The MC can re-roll the picked scenario at any time before or during the round.

**Selection algorithm** — When opening a round, the projector queries `game:scenario` issues, excludes any used earlier in the current game session, then sorts by response count ascending (fewest first), with random tiebreak among the lowest-count bucket. Fresh community-suggested scenarios bubble to the top naturally.

**Re-roll** — A button on the projector that swaps the current scenario for the next pick from the selection algorithm. Always visible. Doubles as the safety valve for a scenario the MC doesn't want shown (instead of a hidden moderation surface) and as a "this one's a dud" lever.

**Game** — A container session run by an MC during a live event. A game spans many rounds and is started/ended explicitly by the MC from the projector. State (current round, timer, reveal cursor) is ephemeral and lives in the projector server's memory; the durable record (scenarios, responses, verdicts) stays in GitHub.

**MC** — The master of ceremonies running the live event. Drives the projector directly (no separate admin UI): starts the game, opens rounds, picks which response to reveal next, ends rounds, ends the game. Holds a microphone and interacts with the crowd between reveals.

**Reveal** — The phase after the submission timer ends. The projector shows tiles for each response whose verdict is ready (author + avatar visible, story hidden). The MC clicks a tile; the story unfolds paragraph by paragraph on screen, ending in the survived/died reveal. New tiles can pop in during reveal as more verdicts land. The MC can skip remaining tiles and advance to the next round at any time.

**Straggler** — A response whose verdict landed after the MC advanced past its round. Stragglers are surfaced in a dedicated strip at the start of the next round's reveal phase as "from round #N". Anything older than one round is orphaned (still in GitHub, never reaches the screen).

**Verdict** — The judge's narrative judgment of a response. Posted as a single comment on the response issue: 3-5 cinematic sentences using the player's first name (e.g. "Jeff activates their super suit just in time…"), followed by a standalone footer line `( {emoji} {name} survived )` or `( {emoji} {name} died )`. The projector splits the comment on sentence boundaries for press-to-advance reveal; the footer is the final press. Tone is cinematic-warm, not snarky. Calibrated around ~50% survival rate.

The `verdict:survived` or `verdict:died` label is applied to the issue by the workflow (derived from the footer's survived/died word). The label is the projector's "ready to reveal" signal — atomic, no race with comment posting.

**Player** — The participant who authored a response issue. Display name for the story is derived as `user.name || user.login` from the GitHub user (with a fallback if neither is friendly). Avatar comes from GitHub.

**Judge** — A custom Oz skill (added to a fork of `oz-for-oss`) that reads a response issue, fetches its linked scenario, and produces a verdict. Runs in the standard webhook → dispatch → cron-drain lifecycle, so the session link surfaces as a progress comment on the response issue.

**Projector** — The React Router app rendered on the venue's TV. Polls GitHub for scenarios, responses, and verdicts and drives the live presentation.

**Session link** — The Oz cloud-run URL posted as a progress comment by the judge workflow. Surfaced in the projector UI so attendees can click through and watch the agent work.
