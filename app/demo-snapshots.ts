import type { GameSnapshot, ResponseVerdict } from "./game.server";

// Dev-only mock states for screenshotting all phases without GitHub data.
// Triggered with ?demo=<phase> on the home route.

const sampleResponses: ResponseVerdict[] = [
  {
    id: "101",
    issueNumber: 101,
    scenarioNumber: 42,
    playerName: "Ben",
    avatarUrl: "https://github.com/identicons/ben.png",
    body: "As the mine collapses around Ben, they deliberately choose to end their life in the chaos, refusing to seek escape.\n\n( 💀 Ben died )",
    verdict: "died",
    arrivedAt: Date.now() - 30_000,
  },
  {
    id: "102",
    issueNumber: 102,
    scenarioNumber: 42,
    playerName: "Sasha",
    avatarUrl: "https://github.com/identicons/sasha.png",
    body: "Sasha calmly digs upward, following the faint trickle of cool air, until daylight breaks through.\n\n( ✨ Sasha survived )",
    verdict: "survived",
    arrivedAt: Date.now() - 25_000,
  },
  {
    id: "103",
    issueNumber: 103,
    scenarioNumber: 42,
    playerName: "Priya",
    avatarUrl: "https://github.com/identicons/priya.png",
    body: "Priya negotiates with the falling rocks. They do not negotiate.\n\n( 💀 Priya died )",
    verdict: "died",
    arrivedAt: Date.now() - 20_000,
  },
  {
    id: "104",
    issueNumber: 104,
    scenarioNumber: 42,
    playerName: "Marcus",
    avatarUrl: "https://github.com/identicons/marcus.png",
    body: "Marcus radios the rescue team, then settles in to wait. They arrive in time.\n\n( ✨ Marcus survived )",
    verdict: "survived",
    arrivedAt: Date.now() - 15_000,
  },
];

const base: GameSnapshot = {
  phase: "idle",
  roundNumber: 0,
  currentScenario: null,
  usedScenarioNumbers: [],
  submissionEndsAt: null,
  submissionDurationSeconds: 180,
  readyResponses: [],
  revealedResponses: [],
  stragglers: [],
  reveal: { selectedResponseId: null, visibleSegments: 0, revealedResponseIds: [] },
  scores: [],
  joinUrl: null,
  suggestPromptUrl: "https://github.com/owner/repo/issues/new",
};

export function getDemoSnapshot(phase: string): GameSnapshot {
  const scenario = {
    number: 42,
    title: "You are trapped in a collapsing mine",
    prompt: "You are trapped in a collapsing mine",
    responseCount: 4,
  };

  if (phase === "confirming") {
    return { ...base, phase: "confirming", roundNumber: 1, currentScenario: scenario };
  }

  if (phase === "submitting") {
    return {
      ...base,
      phase: "submitting",
      roundNumber: 1,
      currentScenario: scenario,
      submissionEndsAt: Date.now() + 59_000,
      joinUrl: "https://github.com/warpdotdev-demos/death-by-ai-github-edition/issues/new?template=response.yml&labels=game%3Aresponse&title=Response%3A&body=responds-to%3A+%2342",
    };
  }

  if (phase === "revealing") {
    return {
      ...base,
      phase: "revealing",
      roundNumber: 1,
      currentScenario: scenario,
      readyResponses: sampleResponses,
      revealedResponses: [],
      scores: [
        { playerName: "Sasha", survived: 2, died: 0, total: 2 },
        { playerName: "Ben", survived: 1, died: 1, total: 1 },
      ],
    };
  }

  if (phase === "reveal-story") {
    return {
      ...base,
      phase: "revealing",
      roundNumber: 1,
      currentScenario: scenario,
      readyResponses: sampleResponses,
      revealedResponses: [],
      reveal: {
        selectedResponseId: "101",
        visibleSegments: 2,
        revealedResponseIds: [],
      },
      scores: [],
    };
  }

  if (phase === "ended") {
    return {
      ...base,
      phase: "ended",
      scores: [
        { playerName: "Sasha", survived: 4, died: 1, total: 4 },
        { playerName: "Marcus", survived: 3, died: 2, total: 3 },
        { playerName: "Ben", survived: 2, died: 3, total: 2 },
        { playerName: "Priya", survived: 1, died: 4, total: 1 },
      ],
    };
  }

  return base;
}
