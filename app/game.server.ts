import {
  buildJoinUrl,
  buildSuggestPromptUrl,
  getApprovedScenarios,
  getReadyResponses,
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
  responsesById: Map<string, ResponseVerdict>;
};

const state: GameState = {
  phase: "idle",
  roundNumber: 0,
  currentScenario: null,
  usedScenarioNumbers: new Set(),
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

export async function getGameSnapshot(): Promise<GameSnapshot> {
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

export async function startGame() {
  state.phase = "confirming";
  state.roundNumber = 1;
  state.previousRoundNumber = null;
  state.previousRevealedResponseIds = [];
  state.scoredResponseIds.clear();
  state.scoresByPlayer.clear();
  state.usedScenarioNumbers.clear();
  state.currentScenario = await pickScenario(state.usedScenarioNumbers);
  resetRoundState();
}

export async function shuffleScenario() {
  if (state.phase !== "confirming" && state.phase !== "submitting") return;
  const next = await pickScenario(state.usedScenarioNumbers, state.currentScenario?.number);
  if (!next && !state.currentScenario) return;
  if (next) state.currentScenario = next;
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
  const scenarios = await getApprovedScenarios();
  const candidates = scenarios.filter(
    (scenario) => !used.has(scenario.number) && scenario.number !== excludeNumber,
  );
  if (!candidates.length) return null;

  const lowestCount = Math.min(...candidates.map((scenario) => scenario.responseCount));
  const lowest = candidates.filter((scenario) => scenario.responseCount === lowestCount);
  return lowest[Math.floor(Math.random() * lowest.length)] ?? null;
}
