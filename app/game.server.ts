export type Scenario = {
  number: number;
  title: string;
  prompt: string;
  responseCount: number;
};

export type Verdict = "survived" | "died";

export type ResponseVerdict = {
  id: string;
  issueNumber: number;
  scenarioNumber: number;
  playerName: string;
  avatarUrl: string;
  body: string;
  verdict: Verdict;
  arrivedAt: number;
};

export type RevealState = {
  selectedResponseId: string | null;
  visibleSegments: number;
  revealedResponseIds: string[];
};

export type PlayerScore = {
  playerName: string;
  survived: number;
  died: number;
  total: number;
};

export type GamePhase = "idle" | "confirming" | "submitting" | "revealing" | "ended";

export type GameSnapshot = {
  phase: GamePhase;
  roundNumber: number;
  currentScenario: Scenario | null;
  usedScenarioNumbers: number[];
  submissionEndsAt: number | null;
  submissionDurationSeconds: number;
  readyResponses: ResponseVerdict[];
  revealedResponses: ResponseVerdict[];
  stragglers: ResponseVerdict[];
  reveal: RevealState;
  scores: PlayerScore[];
  joinUrl: string | null;
  suggestPromptUrl: string;
};

const scenarios: Scenario[] = [
  {
    number: 101,
    title: "Avalanche",
    prompt: "An avalanche is heading towards you",
    responseCount: 0,
  },
  {
    number: 102,
    title: "Puppy swarm",
    prompt: "You're surrounded by 1000 puppies and they all want your sandwich",
    responseCount: 0,
  },
  {
    number: 103,
    title: "Elevator",
    prompt: "The conference elevator is falling and the only tool you have is a tote bag",
    responseCount: 1,
  },
  {
    number: 104,
    title: "AI kitchen",
    prompt: "A smart fridge has locked you in a kitchen and keeps ordering more soup",
    responseCount: 2,
  },
];

const mockResponses: ResponseVerdict[] = [
  {
    id: "r1",
    issueNumber: 201,
    scenarioNumber: 101,
    playerName: "Avery",
    avatarUrl: "https://github.com/identicons/avery.png",
    body: "Avery plants both feet and raises the tote bag like a heroic flag. The avalanche politely ignores the flag and continues being several thousand pounds of snow. Avery dives behind a conference sponsor booth at the final second. The booth becomes a sled, somehow, and carries Avery into the lobby.",
    verdict: "survived",
    arrivedAt: 1,
  },
  {
    id: "r2",
    issueNumber: 202,
    scenarioNumber: 101,
    playerName: "Morgan",
    avatarUrl: "https://github.com/identicons/morgan.png",
    body: "Morgan tries to negotiate with the avalanche using calm stakeholder language. The mountain appreciates the clear agenda but has no calendar availability. Snow engulfs the talking points, the backup slides, and then Morgan.",
    verdict: "died",
    arrivedAt: 2,
  },
  {
    id: "r3",
    issueNumber: 203,
    scenarioNumber: 102,
    playerName: "Sam",
    avatarUrl: "https://github.com/identicons/sam.png",
    body: "Sam breaks the sandwich into tiny pieces and starts a democratic distribution system. The puppies form a line, briefly. One corgi audits the queue, finds fraud, and starts a stampede. Sam escapes by wearing the bread bag as a crown.",
    verdict: "survived",
    arrivedAt: 3,
  },
];

type GameState = {
  phase: GamePhase;
  roundNumber: number;
  currentScenario: Scenario | null;
  usedScenarioNumbers: Set<number>;
  submissionEndsAt: number | null;
  submissionDurationSeconds: number;
  reveal: RevealState;
  previousRoundNumber: number | null;
  previousRevealedResponseIds: string[];
  scoredResponseIds: Set<string>;
  scoresByPlayer: Map<string, PlayerScore>;
};

const state: GameState = {
  phase: "idle",
  roundNumber: 0,
  currentScenario: null,
  usedScenarioNumbers: new Set(),
  submissionEndsAt: null,
  submissionDurationSeconds: 90,
  reveal: {
    selectedResponseId: null,
    visibleSegments: 0,
    revealedResponseIds: [],
  },
  previousRoundNumber: null,
  previousRevealedResponseIds: [],
  scoredResponseIds: new Set(),
  scoresByPlayer: new Map(),
};

export function getGameSnapshot(): GameSnapshot {
  expireTimerIfNeeded();

  const currentScenarioNumber = state.currentScenario?.number;
  const readyResponses = currentScenarioNumber
    ? mockResponses
        .filter((response) => response.scenarioNumber === currentScenarioNumber)
        .filter((response) => !state.reveal.revealedResponseIds.includes(response.id))
        .sort((a, b) => a.arrivedAt - b.arrivedAt)
    : [];
  const revealedResponses = currentScenarioNumber
    ? mockResponses
        .filter((response) => response.scenarioNumber === currentScenarioNumber)
        .filter((response) => state.reveal.revealedResponseIds.includes(response.id))
        .sort((a, b) => a.arrivedAt - b.arrivedAt)
    : [];

  const stragglers = state.previousRoundNumber
    ? mockResponses
        .filter((response) => response.scenarioNumber === state.previousRoundNumber)
        .filter((response) => !state.previousRevealedResponseIds.includes(response.id))
    : [];

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    currentScenario: state.currentScenario,
    usedScenarioNumbers: [...state.usedScenarioNumbers],
    submissionEndsAt: state.submissionEndsAt,
    submissionDurationSeconds: state.submissionDurationSeconds,
    readyResponses,
    revealedResponses,
    stragglers,
    reveal: state.reveal,
    scores: [...state.scoresByPlayer.values()].sort((a, b) => b.total - a.total),
    joinUrl: state.currentScenario ? buildJoinUrl(state.currentScenario) : null,
    suggestPromptUrl: buildSuggestPromptUrl(),
  };
}

export function startGame() {
  state.phase = "confirming";
  state.roundNumber = 1;
  state.previousRoundNumber = null;
  state.previousRevealedResponseIds = [];
  state.scoredResponseIds.clear();
  state.scoresByPlayer.clear();
  state.usedScenarioNumbers.clear();
  state.currentScenario = pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export function shuffleScenario() {
  if (state.phase !== "confirming" && state.phase !== "submitting") return;
  state.currentScenario = pickScenario(state.usedScenarioNumbers, state.currentScenario?.number);
  resetRoundState();
  state.phase = "confirming";
}

export function startTimer(durationSeconds: number) {
  if (!state.currentScenario) return;
  state.phase = "submitting";
  state.submissionDurationSeconds = durationSeconds;
  state.submissionEndsAt = Date.now() + durationSeconds * 1000;
}

export function startReveal() {
  if (!state.currentScenario) return;
  state.phase = "revealing";
  state.submissionEndsAt = null;
  state.usedScenarioNumbers.add(state.currentScenario.number);
}

export function selectResponse(id: string) {
  if (state.phase !== "revealing") return;
  state.reveal.selectedResponseId = id;
  state.reveal.visibleSegments = 1;
}

export function closeResponse() {
  state.reveal.selectedResponseId = null;
  state.reveal.visibleSegments = 0;
}

export function advanceReveal(totalSegments: number) {
  if (!state.reveal.selectedResponseId) return;
  if (state.reveal.visibleSegments < totalSegments) {
    state.reveal.visibleSegments += 1;
    return;
  }

  if (!state.reveal.revealedResponseIds.includes(state.reveal.selectedResponseId)) {
    state.reveal.revealedResponseIds.push(state.reveal.selectedResponseId);
    scoreResponse(state.reveal.selectedResponseId);
  }
  state.reveal.selectedResponseId = null;
  state.reveal.visibleSegments = 0;
}

export function nextRound() {
  scoreCurrentRound();
  state.previousRoundNumber = state.currentScenario?.number ?? null;
  state.previousRevealedResponseIds = [...state.reveal.revealedResponseIds];
  state.roundNumber += 1;
  state.phase = "confirming";
  state.currentScenario = pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export function endGame() {
  state.phase = "ended";
  state.currentScenario = null;
  state.submissionEndsAt = null;
  resetRoundState();
}

function expireTimerIfNeeded() {
  if (
    state.phase === "submitting" &&
    state.submissionEndsAt &&
    Date.now() >= state.submissionEndsAt
  ) {
    startReveal();
  }
}

function resetRoundState() {
  state.submissionEndsAt = null;
  state.reveal = {
    selectedResponseId: null,
    visibleSegments: 0,
    revealedResponseIds: [],
  };
}

function scoreCurrentRound() {
  if (!state.currentScenario) return;

  for (const response of mockResponses) {
    if (response.scenarioNumber !== state.currentScenario.number) continue;
    scoreResponse(response.id);
  }
}

function scoreResponse(responseId: string) {
  if (state.scoredResponseIds.has(responseId)) return;

  const response = mockResponses.find((item) => item.id === responseId);
  if (!response) return;

  const existing = state.scoresByPlayer.get(response.playerName) ?? {
    playerName: response.playerName,
    survived: 0,
    died: 0,
    total: 0,
  };

  state.scoresByPlayer.set(response.playerName, {
    ...existing,
    survived: existing.survived + (response.verdict === "survived" ? 1 : 0),
    died: existing.died + (response.verdict === "died" ? 1 : 0),
    total: existing.total + (response.verdict === "survived" ? 1 : 0),
  });
  state.scoredResponseIds.add(response.id);
}

function pickScenario(used: Set<number>, excludeNumber?: number) {
  const candidates = scenarios.filter(
    (scenario) => !used.has(scenario.number) && scenario.number !== excludeNumber,
  );
  if (!candidates.length) return null;

  const lowestCount = Math.min(...candidates.map((scenario) => scenario.responseCount));
  const lowest = candidates.filter((scenario) => scenario.responseCount === lowestCount);
  return lowest[Math.floor(Math.random() * lowest.length)] ?? null;
}

function buildJoinUrl(scenario: Scenario) {
  const body = `responds-to: #${scenario.number}\n\nName:\n\nSurvival plan:\n`;
  const params = new URLSearchParams({
    template: "response.yml",
    labels: "game:response",
    body,
  });

  return `https://github.com/warpdotdev-demos/death-by-ai-github-edition/issues/new?${params}`;
}

function buildSuggestPromptUrl() {
  const params = new URLSearchParams({
    labels: "game:scenario",
    title: "Scenario: ",
    body: "Prompt:\n",
  });

  return `https://github.com/warpdotdev-demos/death-by-ai-github-edition/issues/new?${params}`;
}
