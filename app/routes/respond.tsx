import { useCallback, useEffect, useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { createResponseIssue, getGitHubUser, getScenario } from "../github.server";
import {
  cleanInput,
  enforceSubmissionRateLimit,
  isHoneypotFilled,
  type SubmissionResult,
  validateGitHubUsername,
  validateLongText,
} from "../submissions.server";
import type { Route } from "./+types/respond";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `Respond to #${params.scenarioNumber} · Death by AI` },
    { name: "description", content: "Submit a Death by AI survival response." },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const scenarioNumber = Number(params.scenarioNumber);
  if (!Number.isInteger(scenarioNumber) || scenarioNumber <= 0) {
    throw new Response("Invalid scenario number", { status: 404 });
  }

  return {
    scenarioNumber,
    scenario: await getScenario(scenarioNumber),
  };
}

export async function action({ request, params }: Route.ActionArgs): Promise<SubmissionResult> {
  const scenarioNumber = Number(params.scenarioNumber);
  if (!Number.isInteger(scenarioNumber) || scenarioNumber <= 0) {
    return { ok: false, error: "Invalid scenario number." };
  }

  const formData = await request.formData();
  if (isHoneypotFilled(formData)) return { ok: false, error: "Submission failed." };

  const rateLimitError = await enforceSubmissionRateLimit(request);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const githubUsername = cleanInput(formData.get("githubUsername")).replace(/^@/, "");
  const response = cleanInput(formData.get("response"));
  const validationError =
    validateGitHubUsername(githubUsername) || validateLongText(response, "Response");
  if (validationError) return { ok: false, error: validationError };

  try {
    if (!(await getScenario(scenarioNumber))) {
      return { ok: false, error: "This scenario is not accepting responses." };
    }
    if (!(await getGitHubUser(githubUsername))) {
      return { ok: false, error: `No GitHub user found for @${githubUsername}.` };
    }
    const issue = await createResponseIssue({ scenarioNumber, githubUsername, response });
    return { ok: true, issueNumber: issue.number, issueUrl: issue.url };
  } catch (error) {
    console.error("Could not create response issue:", error);
    return { ok: false, error: "Could not create the GitHub issue. Please try again." };
  }
}

export default function Respond() {
  const { scenarioNumber, scenario } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [githubUsername, setGithubUsername] = useState("");

  useEffect(() => {
    setGithubUsername(window.localStorage.getItem("dba-github-username") ?? "");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dba-github-username", githubUsername);
  }, [githubUsername]);

  return (
    <SubmissionShell title={`Respond to scenario #${scenarioNumber}`}>
      {scenario ? (
        <div className="mb-5 rounded-2xl bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-dba-yellow">Prompt</p>
          <p className="mt-2 text-lg">{scenario.prompt}</p>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl bg-white/10 p-4">
          <p className="font-display text-xl text-dba-yellow">This scenario is not accepting responses.</p>
          <a className="mt-3 inline-block text-sm underline" href="/suggest">
            Suggest a new scenario
          </a>
        </div>
      )}

      {!scenario ? null : result?.ok ? (
        <div className="space-y-4">
          <SuccessResult
            issueNumber={result.issueNumber}
            issueUrl={result.issueUrl}
            message="Your response is in GitHub. Watch the issue for the Oz judge agent's progress comment and verdict."
          />
          <a
            className="block rounded-2xl bg-white/10 p-5 text-white transition hover:bg-white/15"
            href="/suggest"
          >
            <p className="font-display text-xl text-dba-yellow">
              In the meantime, you can suggest the next scenario.
            </p>
            <p className="mt-2 text-sm text-white/75">Tap here to submit one.</p>
          </a>
        </div>
      ) : (
        <SubmissionForm
          textName="response"
          textLabel="Survival plan"
          textPlaceholder="I would..."
          submitLabel={isSubmitting ? "Submitting..." : "Submit response"}
          error={result?.ok === false ? result.error : null}
          isSubmitting={isSubmitting}
          githubUsername={githubUsername}
          onGithubUsernameChange={setGithubUsername}
        />
      )}
    </SubmissionShell>
  );
}

function SubmissionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-dba-purple-500 px-5 py-8 text-white">
      <div className="mx-auto max-w-xl">
        <p className="font-display text-dba-yellow text-sm tracking-[0.3em] uppercase">
          Death by AI
        </p>
        <h1 className="font-display mt-3 text-4xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

type HandleCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid"; name: string }
  | { status: "invalid" };

function useGitHubHandleCheck() {
  const [check, setCheck] = useState<HandleCheck>({ status: "idle" });

  const verify = useCallback(async (rawHandle: string) => {
    const handle = rawHandle.trim().replace(/^@/, "");
    if (!handle) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    try {
      const response = await fetch(`/api/github-user?username=${encodeURIComponent(handle)}`);
      const data = (await response.json()) as { exists: boolean; login?: string; name?: string };
      setCheck(
        data.exists
          ? { status: "valid", name: data.name ?? data.login ?? handle }
          : { status: "invalid" },
      );
    } catch {
      setCheck({ status: "idle" });
    }
  }, []);

  const reset = useCallback(() => setCheck({ status: "idle" }), []);

  return { check, verify, reset };
}

function HandleBanner({ check }: { check: HandleCheck }) {
  if (check.status === "checking") {
    return (
      <p className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white/70">Checking GitHub username…</p>
    );
  }
  if (check.status === "valid") {
    return (
      <p className="rounded-xl bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">
        Playing as <span className="font-medium">{check.name}</span>.
      </p>
    );
  }
  if (check.status === "invalid") {
    return (
      <p className="rounded-xl bg-red-500/30 px-3 py-2 text-sm">
        No GitHub user found. Check the spelling and try again.
      </p>
    );
  }
  return null;
}

function SubmissionForm({
  textName,
  textLabel,
  textPlaceholder,
  submitLabel,
  error,
  isSubmitting,
  githubUsername,
  onGithubUsernameChange,
}: {
  textName: string;
  textLabel: string;
  textPlaceholder: string;
  submitLabel: string;
  error: string | null;
  isSubmitting: boolean;
  githubUsername: string;
  onGithubUsernameChange: (value: string) => void;
}) {
  const { check, verify, reset } = useGitHubHandleCheck();
  const normalizedHandle = githubUsername.trim().replace(/^@/, "");
  const submitDisabled =
    isSubmitting || normalizedHandle.length === 0 || check.status === "invalid";

  return (
    <Form method="post" className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">GitHub username</span>
        <input
          className="mt-1 w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-black"
          maxLength={39}
          name="githubUsername"
          placeholder="@octocat"
          value={githubUsername}
          onChange={(event) => {
            onGithubUsernameChange(event.target.value);
            reset();
          }}
          onBlur={(event) => verify(event.target.value)}
          required
        />
      </label>
      <HandleBanner check={check} />
      <label className="hidden">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{textLabel}</span>
        <textarea
          className="mt-1 min-h-44 w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-black"
          maxLength={2000}
          minLength={10}
          name={textName}
          placeholder={textPlaceholder}
          required
        />
      </label>
      {error ? <p className="rounded-xl bg-red-500/30 px-3 py-2 text-sm">{error}</p> : null}
      <button
        className="font-display w-full rounded-full bg-dba-yellow px-6 py-3 text-xl text-dba-ink disabled:opacity-60"
        disabled={submitDisabled}
        type="submit"
      >
        {submitLabel}
      </button>
    </Form>
  );
}

function SuccessResult({
  issueNumber,
  issueUrl,
  message,
}: {
  issueNumber: number;
  issueUrl: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 text-dba-ink">
      <p className="font-display text-2xl">Issue #{issueNumber} created</p>
      <p className="mt-3 text-sm">{message}</p>
      <a className="mt-5 inline-block rounded-full bg-dba-purple-500 px-5 py-3 text-white" href={issueUrl}>
        Watch on GitHub
      </a>
    </div>
  );
}
