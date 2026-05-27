import {
  buildJoinUrl,
  buildSuggestPromptUrl,
  getApprovedScenarios,
  getReadyResponses,
  getRepoUrl,
} from "./github.server";

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
  scenarioDeck: Scenario[];
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
  repoUrl: string;
};

type GameState = {
  phase: GamePhase;
  roundNumber: number;
  currentScenario: Scenario | null;
  usedScenarioNumbers: Set<number>;
  scenarioDeck: Scenario[];
  scenarioDeckIndex: number;
  submissionEndsAt: number | null;
  submissionDurationSeconds: number;
  reveal: RevealState;
  previousRoundNumber: number | null;
  previousRevealedResponseIds: string[];
  scoredResponseIds: Set<string>;
  scoresByPlayer: Map<string, PlayerScore>;
  responsesById: Map<string, ResponseVerdict>;
};

const state: GameState = {
  phase: "idle",
  roundNumber: 0,
  currentScenario: null,
  usedScenarioNumbers: new Set(),
  scenarioDeck: [],
  scenarioDeckIndex: 0,
  submissionEndsAt: null,
  submissionDurationSeconds: 240,
  reveal: {
    selectedResponseId: null,
    visibleSegments: 0,
    revealedResponseIds: [],
  },
  previousRoundNumber: null,
  previousRevealedResponseIds: [],
  scoredResponseIds: new Set(),
  scoresByPlayer: new Map(),
  responsesById: new Map(),
};

export async function getGameSnapshot(origin?: string): Promise<GameSnapshot> {
  expireTimerIfNeeded();

  const currentScenarioNumber = state.currentScenario?.number;
  const currentResponses = currentScenarioNumber ? await getReadyResponses(currentScenarioNumber) : [];
  const readyResponses = currentResponses.filter(
    (response) => !state.reveal.revealedResponseIds.includes(response.id),
  );
  const revealedResponses = currentResponses.filter((response) =>
    state.reveal.revealedResponseIds.includes(response.id),
  );

  const stragglers = state.previousRoundNumber
    ? (await getReadyResponses(state.previousRoundNumber)).filter(
        (response) => !state.previousRevealedResponseIds.includes(response.id),
      )
    : [];
  for (const response of [...currentResponses, ...stragglers]) {
    state.responsesById.set(response.id, response);
  }

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    currentScenario: state.currentScenario,
    scenarioDeck: state.scenarioDeck.filter((scenario) => !state.usedScenarioNumbers.has(scenario.number)),
    usedScenarioNumbers: [...state.usedScenarioNumbers],
    submissionEndsAt: state.submissionEndsAt,
    submissionDurationSeconds: state.submissionDurationSeconds,
    readyResponses,
    revealedResponses,
    stragglers,
    reveal: state.reveal,
    scores: [...state.scoresByPlayer.values()].sort((a, b) => b.total - a.total),
    joinUrl: state.currentScenario ? buildJoinUrl(state.currentScenario, origin) : null,
    suggestPromptUrl: buildSuggestPromptUrl(origin),
    repoUrl: getRepoUrl(),
  };
}

function nextScenarioFromDeck(used: Set<number>, excludeNumber?: number) {
  while (state.scenarioDeckIndex < state.scenarioDeck.length) {
    const scenario = state.scenarioDeck[state.scenarioDeckIndex];
    state.scenarioDeckIndex += 1;

    if (used.has(scenario.number) || scenario.number === excludeNumber) continue;
    return scenario;
  }

  return null;
}

function buildScenarioDeck(scenarios: Scenario[]) {
  const grouped = new Map<number, Scenario[]>();
  for (const scenario of scenarios) {
    const group = grouped.get(scenario.responseCount) ?? [];
    group.push(scenario);
    grouped.set(scenario.responseCount, group);
  }

  return [...grouped.entries()]
    .sort(([leftCount], [rightCount]) => leftCount - rightCount)
    .flatMap(([, group]) => shuffle(group));
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export async function startGame() {
  state.phase = "confirming";
  state.roundNumber = 1;
  state.previousRoundNumber = null;
  state.previousRevealedResponseIds = [];
  state.scoredResponseIds.clear();
  state.scoresByPlayer.clear();
  state.usedScenarioNumbers.clear();
  state.scenarioDeck = [];
  state.scenarioDeckIndex = 0;
  state.currentScenario = await pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export function startTimer(durationSeconds: number, scenarioNumber?: number) {
  if (scenarioNumber) commitScenario(scenarioNumber);
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

export function revealResponse(id: string) {
  if (state.phase !== "revealing") return;
  if (!state.reveal.revealedResponseIds.includes(id)) {
    state.reveal.revealedResponseIds.push(id);
    scoreResponse(id);
  }
  state.reveal.selectedResponseId = null;
  state.reveal.visibleSegments = 0;
}


export async function nextRound() {
  scoreCurrentRound();
  state.previousRoundNumber = state.currentScenario?.number ?? null;
  state.previousRevealedResponseIds = [...state.reveal.revealedResponseIds];
  state.roundNumber += 1;
  state.phase = "confirming";
  state.currentScenario = await pickScenario(state.usedScenarioNumbers);
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

  for (const response of state.responsesById.values()) {
    if (response.scenarioNumber !== state.currentScenario.number) continue;
    scoreResponse(response.id);
  }
}

function scoreResponse(responseId: string) {
  if (state.scoredResponseIds.has(responseId)) return;

  const response = state.responsesById.get(responseId);
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

async function pickScenario(used: Set<number>, excludeNumber?: number) {
  const nextFromDeck = nextScenarioFromDeck(used, excludeNumber);
  if (nextFromDeck) return nextFromDeck;

  const scenarios = await getApprovedScenarios();
  state.scenarioDeck = buildScenarioDeck(scenarios);
  state.scenarioDeckIndex = 0;

  return nextScenarioFromDeck(used, excludeNumber);
}

function commitScenario(scenarioNumber: number) {
  const selectedIndex = state.scenarioDeck.findIndex((scenario) => scenario.number === scenarioNumber);
  if (selectedIndex < 0) return;

  state.currentScenario = state.scenarioDeck[selectedIndex];
  state.scenarioDeckIndex = Math.max(state.scenarioDeckIndex, selectedIndex + 1);
}
