import {
  buildJoinUrl,
  buildSuggestPromptUrl,
  getApprovedScenarios,
  getReadyResponses,
  getRepoUrl,
  getScenario,
  getSubmittedResponses,
  type SubmittedResponse,
  type SubmittedResponseStatus,
} from "./github.server";

export type { SubmittedResponse, SubmittedResponseStatus };

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
  responseText: string;
  issueUrl: string;
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
  reveal: RevealState;
  scores: PlayerScore[];
  joinUrl: string | null;
  suggestPromptUrl: string;
  repoUrl: string;
  submittedResponses: SubmittedResponse[];
  urlState: string;
};

type UrlGameState = {
  phase: GamePhase;
  roundNumber: number;
  currentScenario: Scenario | null;
  scenarioDeck: Scenario[];
  usedScenarioNumbers: number[];
  submissionEndsAt: number | null;
  submissionDurationSeconds: number;
  reveal: RevealState;
  scores: PlayerScore[];
  scoredResponseIds: string[];
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

  for (const response of currentResponses) {
    state.responsesById.set(response.id, response);
  }

  const submittedResponses =
    state.phase === "submitting" && currentScenarioNumber
      ? await getSubmittedResponses(currentScenarioNumber)
      : [];

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
    reveal: state.reveal,
    scores: [...state.scoresByPlayer.values()].sort((a, b) => b.total - a.total),
    joinUrl: state.currentScenario ? buildJoinUrl(state.currentScenario, origin) : null,
    suggestPromptUrl: buildSuggestPromptUrl(origin),
    repoUrl: getRepoUrl(),
    submittedResponses,
    urlState: encodeGameState(),
  };
}

export function hydrateGameState(encoded: string | null) {
  if (!encoded) return;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UrlGameState;
    state.phase = parsed.phase;
    state.roundNumber = parsed.roundNumber;
    state.currentScenario = parsed.currentScenario;
    state.scenarioDeck = parsed.scenarioDeck;
    state.scenarioDeckIndex = 0;
    state.usedScenarioNumbers = new Set(parsed.usedScenarioNumbers);
    state.submissionEndsAt = parsed.submissionEndsAt;
    state.submissionDurationSeconds = parsed.submissionDurationSeconds;
    state.reveal = parsed.reveal;
    state.scoresByPlayer = new Map(parsed.scores.map((score) => [score.playerName, score]));
    state.scoredResponseIds = new Set(parsed.scoredResponseIds);
    state.responsesById = new Map();
  } catch (error) {
    console.error("Could not hydrate URL game state:", error);
  }
}

export function encodeGameState() {
  const urlState: UrlGameState = {
    phase: state.phase,
    roundNumber: state.roundNumber,
    currentScenario: state.currentScenario,
    scenarioDeck: state.scenarioDeck,
    usedScenarioNumbers: [...state.usedScenarioNumbers],
    submissionEndsAt: state.submissionEndsAt,
    submissionDurationSeconds: state.submissionDurationSeconds,
    reveal: state.reveal,
    scores: [...state.scoresByPlayer.values()],
    scoredResponseIds: [...state.scoredResponseIds],
  };

  return Buffer.from(JSON.stringify(urlState), "utf8").toString("base64url");
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
  state.scoredResponseIds.clear();
  state.scoresByPlayer.clear();
  state.usedScenarioNumbers.clear();
  state.scenarioDeck = [];
  state.scenarioDeckIndex = 0;
  state.currentScenario = await pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export async function startTimer(durationSeconds: number, scenarioNumber?: number) {
  if (scenarioNumber) commitScenario(scenarioNumber);
  if (!state.currentScenario && scenarioNumber) {
    state.currentScenario = await getScenario(scenarioNumber);
    state.roundNumber = state.roundNumber || 1;
  }
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

// Re-fetch approved scenarios from GitHub and pick a fresh prompt server-side so
// newly-approved scenarios appear mid-game, instead of cycling a stale cached deck.
export async function shuffleScenario() {
  if (state.phase !== "confirming") return;

  const scenarios = await getApprovedScenarios();
  state.scenarioDeck = buildScenarioDeck(scenarios);
  state.scenarioDeckIndex = 0;

  const next = nextScenarioFromDeck(state.usedScenarioNumbers, state.currentScenario?.number);
  if (next) state.currentScenario = next;
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

export async function revealResponse(id: string) {
  if (state.phase !== "revealing") return;
  if (!state.responsesById.has(id) && state.currentScenario) {
    for (const response of await getReadyResponses(state.currentScenario.number)) {
      state.responsesById.set(response.id, response);
    }
  }
  if (!state.reveal.revealedResponseIds.includes(id)) {
    state.reveal.revealedResponseIds.push(id);
    scoreResponse(id);
  }
  state.reveal.selectedResponseId = null;
  state.reveal.visibleSegments = 0;
}


export async function nextRound() {
  await scoreCurrentRound();
  state.roundNumber += 1;
  state.phase = "confirming";
  state.currentScenario = await pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export async function endGame() {
  await scoreCurrentRound();
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

async function scoreCurrentRound() {
  if (!state.currentScenario) return;

  for (const response of await getReadyResponses(state.currentScenario.number)) {
    state.responsesById.set(response.id, response);
  }

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
