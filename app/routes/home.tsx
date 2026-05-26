import { Form, useLoaderData, useNavigation, useSubmit } from "react-router";
import { useEffect } from "react";
import MingcuteCloseLine from "~icons/mingcute/close-line";
import MingcutePlayLine from "~icons/mingcute/play-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import MingcuteShuffle2Line from "~icons/mingcute/shuffle-2-line";
import MingcuteSkullLine from "~icons/mingcute/skull-line";
import MingcuteCheckLine from "~icons/mingcute/check-line";

import { Spiral } from "../components/spiral";
import {
  advanceReveal,
  closeResponse,
  endGame,
  getGameSnapshot,
  nextRound,
  selectResponse,
  shuffleScenario,
  startGame,
  startReveal,
  startTimer,
  type PlayerScore,
  type ResponseVerdict,
} from "../game.server";
import { splitReveal } from "../reveal";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Death by AI: GitHub Edition" },
    { name: "description", content: "Live projector game UI" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo");
  if (demo && process.env.NODE_ENV !== "production") {
    const { getDemoSnapshot } = await import("../demo-snapshots");
    return getDemoSnapshot(demo);
  }
  return getGameSnapshot();
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "start-game") await startGame();
  if (intent === "shuffle") await shuffleScenario();
  if (intent === "start-timer") {
    startTimer(Number(formData.get("durationSeconds") ?? 240));
  }
  if (intent === "start-reveal") startReveal();
  if (intent === "select-response") selectResponse(String(formData.get("responseId")));
  if (intent === "advance-reveal") {
    advanceReveal(Number(formData.get("totalSegments") ?? 0));
  }
  if (intent === "close-response") closeResponse();
  if (intent === "next-round") await nextRound();
  if (intent === "end-game") endGame();

  return getGameSnapshot();
}

export default function Home() {
  const game = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const pendingIntent =
    navigation.state !== "idle" ? String(navigation.formData?.get("intent") ?? "") : null;
  const selectedResponse = [...game.stragglers, ...game.readyResponses, ...game.revealedResponses].find(
    (response) => response.id === game.reveal.selectedResponseId,
  );
  const selectedSegments = selectedResponse ? splitReveal(selectedResponse.body) : null;
  const isLightPhase = game.phase === "revealing" && Boolean(selectedResponse);

  useEffect(() => {
    if (game.phase !== "submitting" && game.phase !== "revealing") return;
    const interval = window.setInterval(() => {
      submit({ intent: "noop" }, { method: "post" });
    }, game.phase === "submitting" ? 1000 : 3000);
    return () => window.clearInterval(interval);
  }, [game.phase, submit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if ((event.code === "Space" || event.key === "ArrowRight") && selectedSegments) {
        event.preventDefault();
        submit(
          {
            intent: "advance-reveal",
            totalSegments: String(selectedSegments.paragraphs.length + 1),
          },
          { method: "post" },
        );
      }
      if (event.key.toLowerCase() === "r") {
        submit({ intent: "shuffle" }, { method: "post" });
      }
      if (event.key.toLowerCase() === "n" && game.phase === "revealing") {
        submit({ intent: "next-round" }, { method: "post" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.phase, selectedSegments, submit]);

  return (
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
        {game.phase === "idle" ? <IdleView pendingIntent={pendingIntent} /> : null}
        {game.phase === "ended" ? <EndedView pendingIntent={pendingIntent} scores={game.scores} /> : null}

        {game.phase === "confirming" ? (
          <ConfirmView
            scenario={game.currentScenario}
            durationSeconds={game.submissionDurationSeconds}
            pendingIntent={pendingIntent}
            suggestPromptUrl={game.suggestPromptUrl}
            roundNumber={game.roundNumber}
            scores={game.scores}
          />
        ) : null}

        {game.phase === "submitting" && game.currentScenario ? (
          <SubmittingView
            prompt={game.currentScenario.prompt}
            submissionEndsAt={game.submissionEndsAt}
            joinUrl={game.joinUrl}
            pendingIntent={pendingIntent}
            roundNumber={game.roundNumber}
          />
        ) : null}

        {game.phase === "revealing" && game.currentScenario ? (
          <RevealView
            prompt={game.currentScenario.prompt}
            stragglers={game.stragglers}
            readyResponses={game.readyResponses}
            revealedResponses={game.revealedResponses}
            selectedResponse={selectedResponse ?? null}
            selectedSegments={selectedSegments}
            visibleSegments={game.reveal.visibleSegments}
            pendingIntent={pendingIntent}
            roundNumber={game.roundNumber}
            scores={game.scores}
          />
        ) : null}
      </div>
    </main>
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

      <p className="mt-12 text-sm uppercase tracking-[0.3em] text-white/60">
        Projector ready · waiting for MC
      </p>
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
  durationSeconds,
  pendingIntent,
  suggestPromptUrl,
  roundNumber,
  scores,
}: {
  scenario: { prompt: string } | null;
  durationSeconds: number;
  pendingIntent: string | null;
  suggestPromptUrl: string;
  roundNumber: number;
  scores: PlayerScore[];
}) {
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
          <Form method="post">
            <input type="hidden" name="intent" value="shuffle" />
            <button
              type="submit"
              disabled={pendingIntent === "shuffle"}
              className="rounded-full bg-dba-yellow px-6 py-3 font-medium text-dba-ink hover:brightness-110 disabled:opacity-60"
            >
              {pendingIntent === "shuffle" ? "Checking..." : "Check again"}
            </button>
          </Form>
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
        <SecondaryButton intent="shuffle" pendingIntent={pendingIntent}>
          <MingcuteShuffle2Line className="text-xl" /> Shuffle
        </SecondaryButton>

        <Form method="post" className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm">
          <input type="hidden" name="intent" value="start-timer" />
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

      <div className="mt-16 flex w-full max-w-5xl justify-between text-sm uppercase tracking-[0.3em] text-white/60">
        <span>R to reshuffle</span>
        <ScoreStrip scores={scores} />
        <SecondaryButton intent="end-game" pendingIntent={pendingIntent} compact>
          <MingcuteCloseLine /> End game
        </SecondaryButton>
      </div>
    </div>
  );
}

/* --------------------------- Submitting view ----------------------------- */

function SubmittingView({
  prompt,
  submissionEndsAt,
  joinUrl,
  pendingIntent,
  roundNumber,
}: {
  prompt: string;
  submissionEndsAt: number | null;
  joinUrl: string | null;
  pendingIntent: string | null;
  roundNumber: number;
}) {
  const remaining = secondsLeft(submissionEndsAt);

  return (
    <div className="flex flex-1 flex-col">
      <PromptBar prompt={prompt} />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="font-display text-dba-yellow text-lg tracking-[0.3em] uppercase">
          Round {roundNumber} · Submissions open
        </p>

        <p
          className={`font-display mt-6 text-[10rem] leading-none drop-shadow-[0_10px_0_rgba(0,0,0,0.25)] md:text-[14rem] ${
            remaining <= 10 ? "text-red-300" : "text-white"
          }`}
        >
          {remaining}
        </p>
        <p className="text-sm uppercase tracking-[0.3em] text-white/70">seconds left</p>

        {joinUrl ? (
          <div className="mt-10 flex flex-col items-center gap-4">
            <p className="text-sm uppercase tracking-[0.3em] text-white/70">
              Scan to join via GitHub
            </p>
            <img
              alt="QR code linking to the GitHub response issue form"
              className="size-56 rounded-2xl border-4 border-white bg-white p-2 shadow-xl"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(
                joinUrl,
              )}`}
            />
          </div>
        ) : null}
      </div>

      <BottomBar>
        <SecondaryButton intent="shuffle" pendingIntent={pendingIntent} compact>
          <MingcuteShuffle2Line /> Reshuffle
        </SecondaryButton>
        <PrimaryButton intent="start-reveal" pendingIntent={pendingIntent}>
          <MingcuteRightLine className="text-2xl" /> Skip to reveal
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

/* ----------------------------- Reveal view ------------------------------- */

function RevealView({
  prompt,
  stragglers,
  readyResponses,
  revealedResponses,
  selectedResponse,
  selectedSegments,
  visibleSegments,
  pendingIntent,
  roundNumber,
  scores,
}: {
  prompt: string;
  stragglers: ResponseVerdict[];
  readyResponses: ResponseVerdict[];
  revealedResponses: ResponseVerdict[];
  selectedResponse: ResponseVerdict | null;
  selectedSegments: { paragraphs: string[]; footer: string } | null;
  visibleSegments: number;
  pendingIntent: string | null;
  roundNumber: number;
  scores: PlayerScore[];
}) {
  if (selectedResponse && selectedSegments) {
    return (
      <div className="flex flex-1 flex-col">
        <RevealPlayer
          response={selectedResponse}
          visibleSegments={visibleSegments}
          paragraphs={selectedSegments.paragraphs}
          footer={selectedSegments.footer}
          pendingIntent={pendingIntent}
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

        {stragglers.length ? (
          <ResponseGrid
            title="From previous round"
            responses={stragglers}
            pendingIntent={pendingIntent}
          />
        ) : null}

        <ResponseGrid
          title="Ready to reveal"
          responses={readyResponses}
          pendingIntent={pendingIntent}
          emptyMessage="Waiting for the judge to weigh in..."
        />

        {revealedResponses.length ? (
          <CompletedGrid responses={revealedResponses} />
        ) : null}
      </div>

      <BottomBar>
        <ScoreStrip scores={scores} />
        <PrimaryButton intent="next-round" pendingIntent={pendingIntent}>
          <MingcuteRightLine className="text-2xl" /> Next round
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

function ResponseGrid({
  title,
  responses,
  pendingIntent,
  emptyMessage,
}: {
  title: string;
  responses: ResponseVerdict[];
  pendingIntent: string | null;
  emptyMessage?: string;
}) {
  const isPending = pendingIntent === "select-response";

  return (
    <section>
      <h3 className="font-display text-dba-yellow mb-4 text-xl tracking-[0.2em] uppercase">
        {title}
      </h3>
      {responses.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {responses.map((response) => (
            <Form key={response.id} method="post" className="contents">
              <input type="hidden" name="intent" value="select-response" />
              <input type="hidden" name="responseId" value={response.id} />
              <button
                type="submit"
                disabled={isPending}
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
            </Form>
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
  paragraphs,
  footer,
  pendingIntent,
}: {
  response: ResponseVerdict;
  visibleSegments: number;
  paragraphs: string[];
  footer: string;
  pendingIntent: string | null;
}) {
  const shownParagraphs = paragraphs.slice(0, Math.min(visibleSegments, paragraphs.length));
  const showFooter = visibleSegments > paragraphs.length;
  const isClosing = pendingIntent === "close-response";
  const isAdvancing = pendingIntent === "advance-reveal";
  const survived = response.verdict === "survived";

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12">
        <div className="mb-8 flex items-center gap-4">
          <img
            alt=""
            className="size-16 rounded-full border-2 border-black/30"
            src={response.avatarUrl}
          />
          <div>
            <p className="font-display text-2xl text-black">
              {response.playerName} tries to&hellip;
            </p>
            <p className="text-sm uppercase tracking-wider text-black/60">
              Issue #{response.issueNumber}
            </p>
          </div>
        </div>

        <div className="relative flex-1 rounded-3xl bg-white p-8 text-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)] md:p-12">
          <div className="space-y-6 font-mono text-2xl leading-relaxed md:text-3xl">
            {shownParagraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            {showFooter ? (
              <p
                className={`font-display mt-8 text-3xl md:text-4xl ${
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
        <SecondaryButton intent="close-response" pendingIntent={pendingIntent} light compact>
          {isClosing ? <Spinner /> : null} Back
        </SecondaryButton>
        <Form method="post">
          <input type="hidden" name="intent" value="advance-reveal" />
          <input type="hidden" name="totalSegments" value={paragraphs.length + 1} />
          <button
            type="submit"
            disabled={isAdvancing}
            className="font-display inline-flex items-center gap-2 rounded-full bg-dba-yellow px-8 py-3 text-xl text-dba-ink hover:brightness-110 disabled:opacity-60"
          >
            {isAdvancing ? <Spinner /> : <MingcuteRightLine className="text-2xl" />}
            {showFooter ? "Close story" : "Continue"}
          </button>
        </Form>
      </BottomBar>
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
  if (!scores.length) {
    return <span className="text-xs uppercase tracking-[0.3em] text-white/50">No scores yet</span>;
  }

  const top = scores.slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {top.map((score) => (
        <span
          key={score.playerName}
          className="rounded-full bg-white/10 px-3 py-1 text-sm"
        >
          <span className="font-display text-dba-yellow mr-2">{score.total}</span>
          {score.playerName}
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
