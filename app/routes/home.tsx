import { Form, useLoaderData, useNavigation, useSubmit } from "react-router";
import { useEffect } from "react";
import MingcuteCloseLine from "~icons/mingcute/close-line";
import MingcutePlayLine from "~icons/mingcute/play-line";
import MingcuteRightLine from "~icons/mingcute/right-line";
import MingcuteShuffle2Line from "~icons/mingcute/shuffle-2-line";

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

export async function loader() {
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
    <main className="min-h-screen bg-white p-6 text-black">
      <header className="mb-6 flex items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold">Death by AI: GitHub Edition</h1>
          <p>Round {game.roundNumber || "-"}</p>
          <Scoreboard scores={game.scores} />
        </div>
        <div className="flex gap-2">
          {game.phase === "confirming" || game.phase === "submitting" ? (
            <>
              <ActionButton icon={<MingcuteShuffle2Line />} intent="shuffle" pendingIntent={pendingIntent}>
                Shuffle prompt
              </ActionButton>
              <ActionButton icon={<MingcuteCloseLine />} intent="end-game" pendingIntent={pendingIntent}>
                End game
              </ActionButton>
            </>
          ) : null}
        </div>
      </header>

      {game.phase === "idle" ? (
        <section>
          <h2>Projector ready</h2>
          <ActionButton icon={<MingcutePlayLine />} intent="start-game" pendingIntent={pendingIntent}>
            Start game
          </ActionButton>
        </section>
      ) : null}

      {game.phase === "ended" ? (
        <section>
          <h2>Game ended</h2>
          <ActionButton icon={<MingcutePlayLine />} intent="start-game" pendingIntent={pendingIntent}>
            Start new game
          </ActionButton>
        </section>
      ) : null}

      {game.phase === "confirming" && game.currentScenario ? (
        <section className="mx-auto max-w-3xl text-center">
          <p>Confirm your scenario</p>
          <h2 className="my-10 text-4xl font-bold">{game.currentScenario.prompt}</h2>
          <div className="flex justify-center gap-3">
            <ActionButton icon={<MingcuteShuffle2Line />} intent="shuffle" pendingIntent={pendingIntent}>
              Shuffle
            </ActionButton>
            <Form method="post">
              <input type="hidden" name="intent" value="start-timer" />
              <label>
                Seconds
                <input
                  className="ml-2 w-20 border border-black p-2"
                  type="number"
                  min="60"
                  max="300"
                  name="durationSeconds"
                  defaultValue={game.submissionDurationSeconds}
                />
              </label>
              <button
                className="ml-3 inline-flex items-center gap-2 border border-black px-4 py-2 disabled:opacity-60"
                disabled={pendingIntent === "start-timer"}
                type="submit"
              >
                {pendingIntent === "start-timer" ? <Spinner /> : null}
                {pendingIntent === "start-timer" ? "Starting..." : "Accept and start timer"}
              </button>
            </Form>
          </div>
        </section>
      ) : null}

      {game.phase === "confirming" && !game.currentScenario ? (
        <section className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold">No prompts ready</h2>
          <p className="my-6">Suggest prompts on GitHub, then reload when labels are ready.</p>
          <div className="flex justify-center gap-3">
            <a className="border border-black px-4 py-2" href={game.suggestPromptUrl}>
              Suggest prompt
            </a>
            <button className="border border-black px-4 py-2" onClick={() => window.location.reload()} type="button">
              Reload
            </button>
          </div>
        </section>
      ) : null}

      {game.phase === "submitting" && game.currentScenario ? (
        <section className="mx-auto max-w-4xl text-center">
          <PromptHeader prompt={game.currentScenario.prompt} />
          <p className="my-8 text-6xl font-bold">{secondsLeft(game.submissionEndsAt)}</p>
          {game.joinUrl ? (
            <p className="break-all border border-black p-4 text-left">{game.joinUrl}</p>
          ) : null}
          <ActionButton icon={<MingcuteRightLine />} intent="start-reveal" pendingIntent={pendingIntent}>
            Skip to reveal
          </ActionButton>
        </section>
      ) : null}

      {game.phase === "revealing" && game.currentScenario ? (
        <section>
          <PromptHeader prompt={game.currentScenario.prompt} />
          {game.stragglers.length ? (
            <ResponseStrip title="From previous round" responses={game.stragglers} pendingIntent={pendingIntent} />
          ) : null}
          {selectedResponse && selectedSegments ? (
            <RevealPlayer
              response={selectedResponse}
              visibleSegments={game.reveal.visibleSegments}
              paragraphs={selectedSegments.paragraphs}
              footer={selectedSegments.footer}
              pendingIntent={pendingIntent}
            />
          ) : (
            <>
              <ResponseStrip title="Ready stories" responses={game.readyResponses} pendingIntent={pendingIntent} />
              {game.revealedResponses.length ? (
                <CompletedStrip responses={game.revealedResponses} />
              ) : null}
            </>
          )}
          {!selectedResponse ? (
            <div className="mt-8 flex gap-2">
              <ActionButton icon={<MingcuteRightLine />} intent="next-round" pendingIntent={pendingIntent}>
                Next round
              </ActionButton>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function ActionButton({
  intent,
  icon,
  pendingIntent,
  children,
}: {
  intent: string;
  icon?: React.ReactNode;
  pendingIntent?: string | null;
  children: React.ReactNode;
}) {
  const isPending = pendingIntent === intent;

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <button
        className="inline-flex items-center gap-2 border border-black px-4 py-2 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? <Spinner /> : icon}
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

function PromptHeader({ prompt }: { prompt: string }) {
  return (
    <div className="mb-6 border-b border-black pb-4">
      <p>Prompt</p>
      <h2 className="text-3xl font-bold">{prompt}</h2>
    </div>
  );
}

function ResponseStrip({
  title,
  responses,
  pendingIntent,
}: {
  title: string;
  responses: ResponseVerdict[];
  pendingIntent: string | null;
}) {
  const isPending = pendingIntent === "select-response";

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-xl font-bold">{title}</h3>
      {responses.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {responses.map((response) => (
            <Form className="border border-black p-4 text-left" key={response.id} method="post">
              <input type="hidden" name="intent" value="select-response" />
              <input type="hidden" name="responseId" value={response.id} />
              <img alt="" className="mb-3 size-12" src={response.avatarUrl} />
              <p className="font-bold">{response.playerName}</p>
              <p>Issue #{response.issueNumber}</p>
              <button
                className="mt-3 inline-flex items-center gap-2 border border-black px-3 py-1 disabled:opacity-60"
                disabled={isPending}
                type="submit"
              >
                {isPending ? <Spinner /> : null}
                {isPending ? "Revealing..." : "Reveal"}
              </button>
            </Form>
          ))}
        </div>
      ) : (
        <p>No ready stories yet.</p>
      )}
    </section>
  );
}

function CompletedStrip({ responses }: { responses: ResponseVerdict[] }) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 text-xl font-bold">Revealed stories</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {responses.map((response) => (
          <div className="border border-black p-4 text-left" key={response.id}>
            <img alt="" className="mb-3 size-12" src={response.avatarUrl} />
            <p className="font-bold">{response.playerName}</p>
            <p>Issue #{response.issueNumber}</p>
            <p className="mt-3 font-bold">{response.verdict === "survived" ? "Survived" : "Died"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Scoreboard({ scores }: { scores: PlayerScore[] }) {
  if (!scores.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {scores.map((score) => (
        <p className="border border-black px-2 py-1" key={score.playerName}>
          {score.playerName}: {score.total} ({score.survived} survived, {score.died} died)
        </p>
      ))}
    </div>
  );
}

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

  return (
    <section className="mx-auto mt-10 flex min-h-[520px] max-w-4xl flex-col">
      <div>
        <div className="mb-6 flex items-center gap-3">
          <img alt="" className="size-12" src={response.avatarUrl} />
          <div>
            <h3 className="text-2xl font-bold">{response.playerName}</h3>
            <p>#{response.issueNumber}</p>
          </div>
        </div>
        <div className="space-y-4 text-2xl">
          {shownParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {showFooter ? <p className="font-bold">{footer}</p> : null}
        </div>
      </div>
      <div className="mt-auto flex gap-2 pt-8">
        <Form method="post">
          <input type="hidden" name="intent" value="close-response" />
          <button
            className="inline-flex items-center gap-2 border border-black px-4 py-2 disabled:opacity-60"
            disabled={isClosing}
            type="submit"
          >
            {isClosing ? <Spinner /> : null}
            Back
          </button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="advance-reveal" />
          <input type="hidden" name="totalSegments" value={paragraphs.length + 1} />
          <button
            className="inline-flex items-center gap-2 border border-black px-4 py-2 disabled:opacity-60"
            disabled={isAdvancing}
            type="submit"
          >
            {isAdvancing ? <Spinner /> : null}
            {showFooter ? "Close story" : "Next"}
          </button>
        </Form>
      </div>
    </section>
  );
}

function secondsLeft(endsAt: number | null) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
