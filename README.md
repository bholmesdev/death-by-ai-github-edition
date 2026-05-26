# Death by AI: GitHub Edition

A live conference party game in the spirit of [Death by AI](https://deathbyai.gg/) — but every input is a real GitHub issue, and the judge is a real cloud agent running on this repo. Doubles as a demo of agents operating on an open-source project.

See [`CONTEXT.md`](./CONTEXT.md) for the canonical glossary.

## The game loop

A **scenario** is a survival prompt — *"You're surrounded by 1000 puppies"*. A **response** is your survival plan. The judge agent writes a short cinematic story deciding whether you live or die.

```
                           ┌───────────────────────────────────────┐
                           │  Anyone files a scenario issue        │
                           │  → moderator agent labels it          │
                           │     scenario:approved / rejected      │
                           └────────────────┬──────────────────────┘
                                            │
                                            ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ ROUND (during the event)                                         │
   │                                                                  │
   │  1. MC clicks "open round" on the projector.                     │
   │     Projector picks an approved scenario with the fewest         │
   │     existing responses (random tiebreak), excluding ones         │
   │     already used this game.                                      │
   │                                                                  │
   │  2. Scenario shows on the TV with a QR code + countdown timer.   │
   │     Attendees scan the QR — it deep-links to GitHub's new-issue  │
   │     page with `responds-to: #N`, `game:response` label, and a    │
   │     "Name" field pre-filled in the body.                         │
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

## Roadmap

### Phase 0 — Game playable on github.com alone (no projector)

Goal: anyone with a browser can play the full game using only github.com — file a scenario, get it moderated; file a response, get a verdict story back. The projector doesn't exist yet.

- Configure labels, issue templates, and Oz GitHub App on this repo
- Port `oz-for-oss` webhook control plane (`api/`, `core/`) into this repo
- Implement `scenario-moderator` skill + workflow
- Implement `death-by-ai-judge` skill + workflow
- Deploy to Vercel with secrets + KV
- Manual smoke test: create scenarios + responses, verify end-to-end

### Phase 1 — Projector

Goal: the game runs live in a room. MC drives a projector that shows the current round, polls GitHub for state, and reveals verdicts theatrically.

- Game/round/reveal state machine in React Router server (ephemeral)
- GitHub polling layer with caching
- Projector UI: scenario view (prompt + QR + timer), reveal view (tiles), reveal player (sentence-by-sentence)
- MC controls: open round, re-roll, start timer, next reveal, end round, end game
- Stragglers carry-over from previous round
- QR code generation with current-scenario deep link

### Phase 2 — Polish & community

- Second QR for scenario suggestion
- Run stock `oz-for-oss` triage in parallel on response issues for comedy effect (real triage labels on absurd prompts)
- Personality selector at game start (chaos / harsh / encouraging)
- Profanity-list redaction at issue insertion
- Avatar / identity polish on the projector
- Post-event leaderboard / gallery
