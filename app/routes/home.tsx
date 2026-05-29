import {
  Form,
  redirect,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigation,
  useSubmit,
} from "react-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import MingcuteCloseLine from "~icons/mingcute/close-line";
import MingcutePlayLine from "~icons/mingcute/play-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import MingcuteShuffle2Line from "~icons/mingcute/shuffle-2-line";
import MingcuteSkullLine from "~icons/mingcute/skull-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";

import { Spiral } from "../components/spiral";
import { JudgedByWarp, PoweredByWarp, WarpMark } from "../components/warp-brand";
import {
  closeResponse,
  encodeGameState,
  endGame,
  getGameSnapshot,
  hydrateGameState,
  nextRound,
  revealResponse,
  selectResponse,
  shuffleScenario,
  startGame,
  startReveal,
  startTimer,
  type PlayerScore,
  type ResponseVerdict,
  type Scenario,
  type SubmittedResponse,
  type SubmittedResponseStatus,
} from "../game.server";
import { splitReveal } from "../reveal";
import type { Route } from "./+types/home";

const GameParamContext = createContext("");

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Death by AI: GitHub Edition" },
    { name: "description", content: "Live projector game UI" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  hydrateGameState(url.searchParams.get("game"));
  const demo = url.searchParams.get("demo");
  if (demo && process.env.NODE_ENV !== "production") {
    const { getDemoSnapshot } = await import("../demo-snapshots");
    return getDemoSnapshot(demo);
  }
  return getGameSnapshot(url.origin);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  hydrateGameState(String(formData.get("game") || ""));
  const origin = new URL(request.url).origin;

  if (intent === "start-game") await startGame();
  if (intent === "shuffle") await shuffleScenario();
  if (intent === "start-timer") {
    await startTimer(
      Number(formData.get("durationSeconds") ?? 240),
      Number(formData.get("scenarioNumber") ?? 0) || undefined,
    );
  }
  if (intent === "start-reveal") startReveal();
  if (intent === "select-response") selectResponse(String(formData.get("responseId")));
  if (intent === "close-response") closeResponse();
  if (intent === "reveal-response") await revealResponse(String(formData.get("responseId")));
  if (intent === "next-round") await nextRound();
  if (intent === "end-game") endGame();

  if (intent === "noop") return getGameSnapshot(origin);

  return redirect(`/?game=${encodeURIComponent(encodeGameState())}`);
}

export default function Home() {
  const game = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const poller = useFetcher<typeof action>();
  const submit = useSubmit();
  const urlGameParam = useGameParam();
  const [acceptedPollGame, setAcceptedPollGame] = useState<typeof game | null>(null);
  const liveGame = acceptedPollGame ?? game;
  const gameParam = liveGame.urlState || urlGameParam;
  const livePhase = liveGame.phase;
  const pendingIntent =
    navigation.state !== "idle" ? String(navigation.formData?.get("intent") ?? "") : null;
  const pendingResponseId =
    pendingIntent === "select-response" ? String(navigation.formData?.get("responseId") ?? "") : null;
  const selectedResponse = [...liveGame.readyResponses, ...liveGame.revealedResponses].find(
    (response) => response.id === liveGame.reveal.selectedResponseId,
  );
  const selectedSegments = selectedResponse ? splitReveal(selectedResponse.body) : null;
  // The reveal story view is driven by RevealView's local selection state (set on
  // card click), not the server-synced selectedResponseId, so it reports up when a
  // story is on screen. Use that to switch the backdrop to its light theme.
  const [storyActive, setStoryActive] = useState(false);
  const isLightPhase = liveGame.phase === "revealing" && storyActive;

  useEffect(() => {
    setAcceptedPollGame(null);
  }, [game.phase, game.currentScenario?.number, game.roundNumber]);

  useEffect(() => {
    if (!poller.data) return;
    const sameScenario = poller.data.currentScenario?.number === liveGame.currentScenario?.number;
    const samePhase = poller.data.phase === liveGame.phase;
    const timerExpired = liveGame.phase === "submitting" && poller.data.phase === "revealing";
    if (sameScenario && (samePhase || timerExpired)) {
      setAcceptedPollGame(poller.data);
    }
  }, [poller.data, liveGame]);

  useEffect(() => {
    if (livePhase !== "submitting" && livePhase !== "revealing") return;
    const interval = window.setInterval(() => {
      poller.submit({ intent: "noop", game: gameParam }, { method: "post" });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [gameParam, livePhase, poller]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === "n" && livePhase === "revealing") {
        submit({ intent: "next-round", game: gameParam }, { method: "post" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameParam, livePhase, submit]);

  return (
    <GameParamContext.Provider value={gameParam}>
    <main className="relative min-h-screen overflow-hidden text-white">
      {isLightPhase ? (
        <Spiral
          background="#e8e8ec"
          arm="rgba(60,60,80,0.18)"
          thickness={140}
          spinSeconds={18}
        />
      ) : (
        <Spiral
          background="var(--color-dba-purple-500)"
          arm="rgba(0,0,0,0.25)"
          thickness={140}
          spinSeconds={14}
        />
      )}

      <div className={`relative z-10 flex min-h-screen flex-col ${isLightPhase ? "text-black" : "text-white"}`}>
        {liveGame.phase === "idle" ? <IdleView pendingIntent={pendingIntent} /> : null}
        {liveGame.phase === "ended" ? <EndedView pendingIntent={pendingIntent} scores={liveGame.scores} /> : null}

        {liveGame.phase === "confirming" ? (
          <ConfirmView
            scenario={liveGame.currentScenario}
            scenarioDeck={liveGame.scenarioDeck}
            durationSeconds={liveGame.submissionDurationSeconds}
            pendingIntent={pendingIntent}
            suggestPromptUrl={liveGame.suggestPromptUrl}
            roundNumber={liveGame.roundNumber}
            scores={liveGame.scores}
          />
        ) : null}

        {liveGame.phase === "submitting" && liveGame.currentScenario ? (
          <SubmittingView
            prompt={liveGame.currentScenario.prompt}
            submissionEndsAt={liveGame.submissionEndsAt}
            joinUrl={liveGame.joinUrl}
            repoUrl={liveGame.repoUrl}
            scenarioNumber={liveGame.currentScenario.number}
            pendingIntent={pendingIntent}
            roundNumber={liveGame.roundNumber}
            submittedResponses={liveGame.submittedResponses}
          />
        ) : null}

        {liveGame.phase === "revealing" && liveGame.currentScenario ? (
          <RevealView
            prompt={liveGame.currentScenario.prompt}
            readyResponses={liveGame.readyResponses}
            revealedResponses={liveGame.revealedResponses}
            pendingResponseId={pendingResponseId}
            selectedResponse={selectedResponse ?? null}
            selectedSegments={selectedSegments}
            visibleSegments={liveGame.reveal.visibleSegments}
            pendingIntent={pendingIntent}
            roundNumber={liveGame.roundNumber}
            scores={liveGame.scores}
            onStoryActiveChange={setStoryActive}
          />
        ) : null}
      </div>
    </main>
    </GameParamContext.Provider>
  );
}

/* -------------------------------- Idle view ------------------------------- */

function IdleView({ pendingIntent }: { pendingIntent: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <p className="font-display text-dba-yellow text-xl tracking-[0.4em] uppercase">
        Welcome to
      </p>
      <h1 className="font-display mt-4 text-7xl md:text-9xl drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]">
        Death by AI
      </h1>
      <p className="font-display mt-2 text-3xl text-dba-purple-200">GitHub Edition</p>

      <div className="mt-16">
        <PrimaryButton intent="start-game" pendingIntent={pendingIntent}>
          <MingcutePlayLine className="text-2xl" /> Start game
        </PrimaryButton>
      </div>

      <PoweredByWarp className="mt-20" />
    </div>
  );
}

/* ------------------------------- Ended view ------------------------------- */

function EndedView({
  pendingIntent,
  scores,
}: {
  pendingIntent: string | null;
  scores: PlayerScore[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <p className="font-display text-dba-yellow text-xl tracking-[0.4em] uppercase">
        Game over
      </p>
      <h1 className="font-display mt-4 text-7xl md:text-8xl drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]">
        Final Scores
      </h1>

      <div className="mt-10 w-full max-w-3xl space-y-3">
        {scores.length ? (
          scores.map((score, index) => (
            <ScoreRow key={score.playerName} score={score} rank={index + 1} />
          ))
        ) : (
          <p className="text-dba-purple-200">No survivors recorded.</p>
        )}
      </div>

      <div className="mt-12">
        <PrimaryButton intent="start-game" pendingIntent={pendingIntent}>
          <MingcutePlayLine className="text-2xl" /> Start new game
        </PrimaryButton>
      </div>

      <PoweredByWarp className="mt-16" />
    </div>
  );
}

function ScoreRow({ score, rank }: { score: PlayerScore; rank: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <span className="font-display text-dba-yellow text-2xl">#{rank}</span>
        <span className="font-display text-2xl">{score.playerName}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-full bg-emerald-500/30 px-3 py-1">
          <MingcuteCheckLine className="-mt-0.5 mr-1 inline" />
          {score.survived}
        </span>
        <span className="rounded-full bg-red-500/30 px-3 py-1">
          <MingcuteSkullLine className="-mt-0.5 mr-1 inline" />
          {score.died}
        </span>
        <span className="font-display ml-1 w-10 text-right text-2xl">{score.total}</span>
      </div>
    </div>
  );
}

/* ----------------------------- Confirm view ------------------------------ */

function ConfirmView({
  scenario,
  scenarioDeck,
  durationSeconds,
  pendingIntent,
  suggestPromptUrl,
  roundNumber,
  scores,
}: {
  scenario: Scenario | null;
  scenarioDeck: Scenario[];
  durationSeconds: number;
  pendingIntent: string | null;
  suggestPromptUrl: string;
  roundNumber: number;
  scores: PlayerScore[];
}) {
  const gameParam = useGameParam();
  const isShuffling = pendingIntent === "shuffle";

  if (!scenario) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="font-display text-dba-yellow text-lg tracking-[0.3em] uppercase">
          Round {roundNumber}
        </p>
        <h2 className="font-display mt-4 text-5xl md:text-6xl">No prompts ready</h2>
        <p className="mt-6 max-w-xl text-lg text-white/80">
          Suggest a prompt on GitHub, then check again once the moderator approves it.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            className="rounded-full bg-white/15 px-6 py-3 font-medium hover:bg-white/25"
            href={suggestPromptUrl}
            target="_blank"
            rel="noreferrer"
          >
            Suggest prompt
          </a>
        </div>
        <div className="mt-10">
          <SecondaryButton intent="end-game" pendingIntent={pendingIntent} compact>
            <MingcuteCloseLine /> End game
          </SecondaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16">
      <PhaseBadge>Round {roundNumber} · Confirm scenario</PhaseBadge>

      <div className="mx-auto mt-10 max-w-5xl text-center">
        <p className="font-display text-dba-yellow text-xl tracking-[0.3em] uppercase">
          Prompt
        </p>
        <h2 className="font-display mt-4 text-5xl leading-tight md:text-7xl drop-shadow-[0_6px_0_rgba(0,0,0,0.25)]">
          {scenario.prompt}
        </h2>
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
        <Form method="post">
          <input type="hidden" name="intent" value="shuffle" />
          <input type="hidden" name="game" value={gameParam} />
          <button
            type="submit"
            className="font-display inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-base text-white hover:bg-white/25 disabled:opacity-60"
            disabled={isShuffling || scenarioDeck.length < 2}
          >
            {isShuffling ? <Spinner /> : <MingcuteShuffle2Line className="text-xl" />}
            {isShuffling ? "Shuffling..." : "Shuffle"}
          </button>
        </Form>

        <Form method="post" className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm">
          <input type="hidden" name="intent" value="start-timer" />
          <input type="hidden" name="game" value={gameParam} />
          <input type="hidden" name="scenarioNumber" value={scenario.number} />
          <label className="flex items-center gap-2 text-sm uppercase tracking-wider text-white/80">
            Timer
            <input
              className="w-16 rounded-md bg-black/30 px-2 py-1 text-center text-white"
              type="number"
              min="30"
              max="600"
              name="durationSeconds"
              defaultValue={durationSeconds}
            />
            sec
          </label>
          <button
            className="font-display flex items-center gap-2 rounded-full bg-dba-yellow px-6 py-2 text-lg text-dba-ink hover:brightness-110 disabled:opacity-60"
            disabled={pendingIntent === "start-timer"}
            type="submit"
          >
            {pendingIntent === "start-timer" ? <Spinner /> : <MingcutePlayLine className="text-xl" />}
            {pendingIntent === "start-timer" ? "Starting..." : "Start round"}
          </button>
        </Form>
      </div>

      <div className="mt-16 w-full max-w-5xl">
        <GameFooter pendingIntent={pendingIntent} scores={scores} />
      </div>
    </div>
  );
}

function GameFooter({
  children,
  pendingIntent,
  scores,
  light = false,
}: {
  children?: React.ReactNode;
  pendingIntent: string | null;
  scores: PlayerScore[];
  light?: boolean;
}) {
  return (
    <BottomBar light={light}>
      <div className="flex min-w-0 flex-1 items-center justify-start gap-3">
        <WarpMark className="h-4 w-auto shrink-0 opacity-40" />
        <ScoreStrip scores={scores} />
      </div>
      {children ? <div className="flex shrink-0 justify-center gap-3">{children}</div> : null}
      <div className="flex flex-1 justify-end">
        <SecondaryButton intent="end-game" pendingIntent={pendingIntent} compact light={light}>
          <MingcuteCloseLine /> End game
        </SecondaryButton>
      </div>
    </BottomBar>
  );
}

/* --------------------------- Submitting view ----------------------------- */

function SubmittingView({
  prompt,
  submissionEndsAt,
  joinUrl,
  repoUrl,
  scenarioNumber,
  pendingIntent,
  roundNumber,
  submittedResponses,
}: {
  prompt: string;
  submissionEndsAt: number | null;
  joinUrl: string | null;
  repoUrl: string;
  scenarioNumber: number;
  pendingIntent: string | null;
  roundNumber: number;
  submittedResponses: SubmittedResponse[];
}) {
  const remaining = useSecondsLeft(submissionEndsAt);
  const hasResponses = submittedResponses.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <PromptBar prompt={prompt} />

      <div className="flex flex-1 min-h-0">
        {/* Left panel: timer + join info */}
        <div
          className={`flex shrink-0 flex-col items-center justify-center px-8 py-8 text-center ${
            hasResponses ? "w-2/5" : "w-full"
          }`}
        >
          <p className="font-display text-dba-yellow text-lg tracking-[0.3em] uppercase">
            Round {roundNumber} · Submissions open
          </p>

          <p
            className={`font-display mt-4 leading-none drop-shadow-[0_10px_0_rgba(0,0,0,0.25)] transition-all duration-500 ${
              hasResponses ? "text-[8rem]" : "text-[10rem] md:text-[14rem]"
            } ${remaining <= 10 ? "text-red-300" : "text-white"}`}
          >
            {remaining}
          </p>

          {joinUrl ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <p className="text-sm uppercase tracking-[0.3em] text-white/70">
                Scan to respond
              </p>
              <img
                alt="QR code linking to the GitHub response issue form"
                className={`rounded-2xl border-4 border-white bg-white p-2 shadow-xl transition-all duration-500 ${
                  hasResponses ? "size-36" : "size-56"
                }`}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(
                  joinUrl,
                )}`}
              />
              <p
                className={`font-display text-white transition-all duration-500 ${
                  hasResponses ? "text-base" : "text-2xl md:text-3xl"
                }`}
              >
                {joinUrl}
              </p>
            </div>
          ) : null}
        </div>

        {/* Right panel: response grid */}
        {hasResponses ? (
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto border-l border-white/10 px-6 py-8">
            <SubmittedResponsesFeed responses={submittedResponses} />
          </div>
        ) : null}
      </div>

      <GameFooter pendingIntent={pendingIntent} scores={[]}>
        <PrimaryButton intent="start-reveal" pendingIntent={pendingIntent}>
          <MingcuteRightLine className="text-2xl" /> Skip to reveal
        </PrimaryButton>
      </GameFooter>
    </div>
  );
}

/* ----------------------------- Reveal view ------------------------------- */

function RevealView({
  prompt,
  readyResponses,
  revealedResponses,
  pendingResponseId,
  selectedResponse,
  selectedSegments,
  visibleSegments,
  pendingIntent,
  roundNumber,
  scores,
  onStoryActiveChange,
}: {
  prompt: string;
  readyResponses: ResponseVerdict[];
  revealedResponses: ResponseVerdict[];
  pendingResponseId: string | null;
  selectedResponse: ResponseVerdict | null;
  selectedSegments: { segments: string[]; footer: string } | null;
  visibleSegments: number;
  pendingIntent: string | null;
  roundNumber: number;
  scores: PlayerScore[];
  onStoryActiveChange: (active: boolean) => void;
}) {
  const revealSubmitter = useFetcher<typeof action>();
  const gameParam = useGameParam();
  const [localSelectedResponse, setLocalSelectedResponse] = useState<ResponseVerdict | null>(
    selectedResponse ?? null,
  );
  const [localRevealedIds, setLocalRevealedIds] = useState(new Set<string>());
  const localSelectedSegments = localSelectedResponse ? splitReveal(localSelectedResponse.body) : null;
  const revealedIds = new Set([
    ...revealedResponses.map((response) => response.id),
    ...localRevealedIds,
  ]);
  const visibleReadyResponses = readyResponses.filter((response) => !revealedIds.has(response.id));
  const visibleRevealedResponses = [
    ...revealedResponses,
    ...readyResponses.filter((response) => localRevealedIds.has(response.id)),
  ];
  const storyActive = Boolean(localSelectedResponse && localSelectedSegments);

  useEffect(() => {
    onStoryActiveChange(storyActive);
  }, [storyActive, onStoryActiveChange]);

  useEffect(() => () => onStoryActiveChange(false), [onStoryActiveChange]);

  useEffect(() => {
    setLocalSelectedResponse(null);
    setLocalRevealedIds(new Set());
  }, [roundNumber]);

  useEffect(() => {
    setLocalRevealedIds((ids) => {
      const next = new Set(ids);
      for (const response of revealedResponses) next.delete(response.id);
      return next.size === ids.size ? ids : next;
    });
  }, [revealedResponses]);

  if (localSelectedResponse && localSelectedSegments) {
    return (
      <div className="flex flex-1 flex-col">
        <RevealPlayer
          response={localSelectedResponse}
          visibleSegments={visibleSegments}
          segments={localSelectedSegments.segments}
          footer={localSelectedSegments.footer}
          pendingIntent={pendingIntent}
          onBack={() => setLocalSelectedResponse(null)}
          onReveal={() => {
            setLocalRevealedIds((ids) => new Set([...ids, localSelectedResponse.id]));
          }}
          onComplete={() => {
            setLocalSelectedResponse(null);
            revealSubmitter.submit(
              { intent: "reveal-response", responseId: localSelectedResponse.id, game: gameParam },
              { method: "post" },
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PromptBar prompt={prompt} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
        <div className="text-center">
          <p className="font-display text-dba-yellow text-lg tracking-[0.3em] uppercase">
            Round {roundNumber} · Reveal time
          </p>
          <h2 className="font-display mt-3 text-4xl md:text-5xl">Pick a response</h2>
        </div>

        <ResponseGrid
          title="Ready to reveal"
          responses={visibleReadyResponses}
          pendingResponseId={pendingResponseId}
          emptyMessage="Waiting for the judge to weigh in..."
          onSelect={setLocalSelectedResponse}
        />

        {visibleRevealedResponses.length ? (
          <CompletedGrid responses={visibleRevealedResponses} />
        ) : null}
      </div>

      <GameFooter pendingIntent={pendingIntent} scores={scores}>
        <PrimaryButton intent="next-round" pendingIntent={pendingIntent}>
          <MingcuteRightLine className="text-2xl" /> Next round
        </PrimaryButton>
      </GameFooter>
    </div>
  );
}

function ResponseGrid({
  title,
  responses,
  pendingResponseId,
  emptyMessage,
  onSelect,
}: {
  title: string;
  responses: ResponseVerdict[];
  pendingResponseId: string | null;
  emptyMessage?: string;
  onSelect: (response: ResponseVerdict) => void;
}) {

  return (
    <section>
      <h3 className="font-display text-dba-yellow mb-4 text-xl tracking-[0.2em] uppercase">
        {title}
      </h3>
      {responses.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {responses.map((response) => (
            <div key={response.id} className="contents">
              <button
                type="button"
                disabled={pendingResponseId === response.id}
                onClick={() => onSelect(response)}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-white/40 bg-black/20 p-4 text-center transition hover:-translate-y-1 hover:border-dba-yellow hover:bg-black/30 disabled:opacity-60"
              >
                <img
                  alt=""
                  className="size-16 rounded-full border-2 border-white/60 group-hover:border-dba-yellow"
                  src={response.avatarUrl}
                />
                <span className="font-display text-lg">{response.playerName}</span>
                <span className="text-xs uppercase tracking-wider text-white/60">
                  Issue #{response.issueNumber}
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-white/30 px-5 py-6 text-center text-white/70">
          {emptyMessage ?? "Nothing yet."}
        </p>
      )}
    </section>
  );
}

function CompletedGrid({ responses }: { responses: ResponseVerdict[] }) {
  return (
    <section>
      <h3 className="font-display text-dba-purple-200 mb-4 text-xl tracking-[0.2em] uppercase">
        Already revealed
      </h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {responses.map((response) => (
          <div
            key={response.id}
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"
          >
            <img alt="" className="size-8 rounded-full" src={response.avatarUrl} />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{response.playerName}</p>
              <p
                className={`text-xs uppercase tracking-wider ${
                  response.verdict === "survived" ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {response.verdict}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- Reveal player ----------------------------- */

function RevealPlayer({
  response,
  visibleSegments,
  segments,
  footer,
  pendingIntent,
  onBack,
  onReveal,
  onComplete,
}: {
  response: ResponseVerdict;
  visibleSegments: number;
  segments: string[];
  footer: string;
  pendingIntent: string | null;
  onBack: () => void;
  onReveal: () => void;
  onComplete: () => void;
}) {
  const [localSegments, setLocalSegments] = useState(visibleSegments || 1);
  const [showResponse, setShowResponse] = useState(false);
  const didReveal = useRef(false);
  const shownSegments = segments.slice(0, Math.min(localSegments, segments.length));
  const showFooter = localSegments > segments.length;
  const survived = response.verdict === "survived";

  useEffect(() => {
    setLocalSegments(visibleSegments || 1);
    setShowResponse(false);
    didReveal.current = false;
  }, [response.id, visibleSegments]);

  useEffect(() => {
    if (!showFooter || didReveal.current) return;
    didReveal.current = true;
    onReveal();
  }, [onReveal, showFooter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code !== "Space" && event.key !== "ArrowRight") return;

      event.preventDefault();
      if (localSegments <= segments.length) {
        setLocalSegments((count) => count + 1);
        return;
      }

      onComplete();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [localSegments, onComplete, segments.length]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              alt=""
              className="size-12 rounded-full border-2 border-black/30"
              src={response.avatarUrl}
            />
            <div>
              <p className="font-display text-xl text-black">
                {response.playerName} tries to&hellip;
              </p>
              <p className="text-xs uppercase tracking-wider text-black/60">
                Issue #{response.issueNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowResponse((shown) => !shown)}
              className="font-display inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm text-black hover:bg-black/20"
            >
              {showResponse ? "Hide response" : "Show response"}
            </button>
            <a
              href={response.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="font-display inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm text-black hover:bg-black/20"
            >
              View on GitHub
            </a>
          </div>
          <JudgedByWarp className="ml-auto" />
        </div>

        {showResponse ? (
          <div className="mb-4 rounded-2xl border-2 border-black/15 bg-black/[0.03] p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-black/50">
              Original response
            </p>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-black/80">
              {response.responseText || "No response text provided."}
            </p>
          </div>
        ) : null}

        <div className="relative flex-1 overflow-auto rounded-3xl bg-white p-6 text-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)] md:p-8">
          <div className="space-y-3 text-base leading-relaxed md:text-lg">
            {shownSegments.map((sentence, i) => (
              <p key={i}>{sentence}</p>
            ))}
            {showFooter ? (
              <p
                className={`font-display mt-6 text-2xl md:text-3xl ${
                  survived ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {footer}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <BottomBar light>
        <div className="flex flex-1 justify-start">
          <button
            type="button"
            onClick={onBack}
            className="font-display inline-flex items-center gap-2 rounded-full bg-black/10 px-5 py-3 text-base text-black hover:bg-black/20 disabled:opacity-60"
          >
            Back
          </button>
        </div>
        <button
          type="button"
          className="font-display inline-flex min-w-80 items-center justify-center gap-3 rounded-full bg-dba-yellow px-12 py-4 text-3xl text-dba-ink shadow-[0_4px_0_rgba(0,0,0,0.18)] hover:brightness-110 disabled:opacity-60"
          onClick={() => {
            if (localSegments <= segments.length) {
              setLocalSegments((count) => count + 1);
              return;
            }
            onComplete();
          }}
        >
          <MingcuteRightLine className="text-2xl" />
          {showFooter ? "Close story" : "Continue"}
        </button>
        <div className="flex flex-1 justify-end">
          <SecondaryButton intent="end-game" pendingIntent={pendingIntent} light>
            <MingcuteCloseLine /> End game
          </SecondaryButton>
        </div>
      </BottomBar>
    </div>
  );
}

/* ----------------------- Submitted responses feed ------------------------ */

const STATUS_META: Record<
  SubmittedResponseStatus,
  { label: string; className: string; pulse: boolean }
> = {
  submitted:     { label: "Submitted", className: "bg-white/20 text-white/70",         pulse: false },
  "in-progress": { label: "Judging…",  className: "bg-dba-yellow/20 text-dba-yellow", pulse: true  },
  survived:      { label: "Judged",    className: "bg-white/20 text-white/70",         pulse: false },
  died:          { label: "Judged",    className: "bg-white/20 text-white/70",         pulse: false },
};

function SubmittedResponsesFeed({ responses }: { responses: SubmittedResponse[] }) {
  const prevIssueNumbers = useRef(new Set<number>());
  const [newIds, setNewIds] = useState(new Set<number>());

  useEffect(() => {
    const incoming = responses
      .map((r) => r.issueNumber)
      .filter((n) => !prevIssueNumbers.current.has(n));

    if (incoming.length > 0) {
      setNewIds((prev) => new Set([...prev, ...incoming]));
      incoming.forEach((n) => prevIssueNumbers.current.add(n));

      const timer = window.setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          incoming.forEach((n) => next.delete(n));
          return next;
        });
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [responses]);

  if (!responses.length) return null;

  return (
    <div className="h-full">
      <p className="mb-4 text-xs uppercase tracking-[0.3em] text-white/50">
        {responses.length} response{responses.length !== 1 ? "s" : ""} in
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {responses.map((r) => {
          const meta = STATUS_META[r.status];
          const isNew = newIds.has(r.issueNumber);
          return (
            <a
              key={r.issueNumber}
              href={r.issueUrl}
              target="_blank"
              rel="noreferrer"
              className={`group flex flex-col items-center gap-3 rounded-2xl border-2 bg-black/20 p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:bg-black/30 ${
                isNew
                  ? "scale-105 border-dba-yellow shadow-[0_0_16px_rgba(255,220,50,0.35)]"
                  : "border-white/30 hover:border-dba-yellow"
              }`}
            >
              <img
                alt=""
                className="size-16 rounded-full border-2 border-white/40 group-hover:border-dba-yellow"
                src={r.avatarUrl}
              />
              <span className="font-display text-lg">{r.playerName}</span>
              <span className="text-xs uppercase tracking-wider text-white/50">
                Issue #{r.issueNumber}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${
                  meta.className
                } ${meta.pulse ? "animate-pulse" : ""}`}
              >
                {meta.label}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- Shared bits ------------------------------- */

function PromptBar({ prompt }: { prompt: string }) {
  return (
    <div className="w-full bg-dba-purple-700/80 px-6 py-3 text-center shadow-[0_3px_0_rgba(0,0,0,0.25)] backdrop-blur-sm">
      <span className="font-display text-dba-yellow mr-2 text-lg md:text-xl">
        Prompt:
      </span>
      <span className="font-display text-lg text-white md:text-2xl">{prompt}</span>
    </div>
  );
}

function PhaseBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display rounded-full bg-black/30 px-5 py-2 text-sm tracking-[0.3em] uppercase text-dba-yellow">
      {children}
    </span>
  );
}

function BottomBar({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div
      className={`mt-auto flex items-center justify-between gap-4 px-6 py-5 ${
        light ? "bg-white/60 text-black backdrop-blur-sm" : "bg-black/30 text-white backdrop-blur-sm"
      }`}
    >
      {children}
    </div>
  );
}

function ScoreStrip({ scores }: { scores: PlayerScore[] }) {
  if (!scores.length) return null;

  const top = scores.slice(0, 4);

  return (
    <div className="flex flex-wrap items-center justify-start gap-2">
      {top.map((score) => (
        <span
          key={score.playerName}
          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-dba-ink"
        >
          <span>{score.playerName}</span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <MingcuteCheckLine className="text-base" />
            {score.survived}
          </span>
          <span className="inline-flex items-center gap-1 text-red-700">
            <MingcuteSkullLine className="text-base" />
            {score.died}
          </span>
        </span>
      ))}
    </div>
  );
}

function PrimaryButton({
  intent,
  pendingIntent,
  children,
}: {
  intent: string;
  pendingIntent?: string | null;
  children: React.ReactNode;
}) {
  const isPending = pendingIntent === intent;

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <GameParamInput />
      <button
        type="submit"
        disabled={isPending}
        className="font-display inline-flex items-center gap-3 rounded-full bg-dba-yellow px-8 py-4 text-2xl text-dba-ink shadow-[0_6px_0_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-60"
      >
        {isPending ? <Spinner /> : null}
        {children}
      </button>
    </Form>
  );
}

function SecondaryButton({
  intent,
  pendingIntent,
  children,
  compact = false,
  light = false,
}: {
  intent: string;
  pendingIntent?: string | null;
  children: React.ReactNode;
  compact?: boolean;
  light?: boolean;
}) {
  const isPending = pendingIntent === intent;
  const padding = compact ? "px-4 py-2 text-sm" : "px-5 py-3 text-base";
  const palette = light
    ? "bg-black/10 text-black hover:bg-black/20"
    : "bg-white/15 text-white hover:bg-white/25";

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <GameParamInput />
      <button
        type="submit"
        disabled={isPending}
        className={`font-display inline-flex items-center gap-2 rounded-full ${padding} ${palette} disabled:opacity-60`}
      >
        {isPending ? <Spinner /> : null}
        {children}
      </button>
    </Form>
  );
}

function GameParamInput() {
  return <input type="hidden" name="game" value={useGameParam()} />;
}

function useGameParam() {
  const contextValue = useContext(GameParamContext);
  const locationValue = new URLSearchParams(useLocation().search).get("game") ?? "";
  return contextValue || locationValue;
}

function useSecondsLeft(endsAt: number | null) {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));

  useEffect(() => {
    setRemaining(secondsLeft(endsAt));
    if (!endsAt) return;

    const tick = () => setRemaining(secondsLeft(endsAt));
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  return remaining;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

function secondsLeft(endsAt: number | null) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
