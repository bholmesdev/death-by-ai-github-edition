import { useCallback, useEffect, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";

import { createScenarioIssue, getGitHubUser } from "../github.server";
import {
  cleanInput,
  enforceSubmissionRateLimit,
  isHoneypotFilled,
  type SubmissionResult,
  validateGitHubUsername,
  validateLongText,
} from "../submissions.server";
import type { Route } from "./+types/suggest";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Suggest a scenario · Death by AI" },
    { name: "description", content: "Suggest a Death by AI scenario." },
  ];
}

export async function action({ request }: Route.ActionArgs): Promise<SubmissionResult> {
  const formData = await request.formData();
  if (isHoneypotFilled(formData)) return { ok: false, error: "Submission failed." };

  const rateLimitError = await enforceSubmissionRateLimit(request);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const githubUsername = cleanInput(formData.get("githubUsername")).replace(/^@/, "");
  const prompt = cleanInput(formData.get("prompt"));
  const validationError =
    validateGitHubUsername(githubUsername) || validateLongText(prompt, "Scenario");
  if (validationError) return { ok: false, error: validationError };

  try {
    if (!(await getGitHubUser(githubUsername))) {
      return { ok: false, error: `No GitHub user found for @${githubUsername}.` };
    }
    const issue = await createScenarioIssue({ githubUsername, prompt });
    return { ok: true, issueNumber: issue.number, issueUrl: issue.url };
  } catch (error) {
    console.error("Could not create scenario issue:", error);
    return { ok: false, error: "Could not create the GitHub issue. Please try again." };
  }
}

export default function Suggest() {
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [githubUsername, setGithubUsername] = useState("");
  const { check, verify, reset } = useGitHubHandleCheck();
  const normalizedHandle = githubUsername.trim().replace(/^@/, "");
  const submitDisabled =
    isSubmitting || normalizedHandle.length === 0 || check.status === "invalid";

  useEffect(() => {
    setGithubUsername(window.localStorage.getItem("dba-github-username") ?? "");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dba-github-username", githubUsername);
  }, [githubUsername]);

  return (
    <main className="min-h-screen bg-dba-purple-500 px-5 py-8 text-white">
      <div className="mx-auto max-w-xl">
        <p className="font-display text-dba-yellow text-sm tracking-[0.3em] uppercase">
          Death by AI
        </p>
        <h1 className="font-display mt-3 text-4xl">Suggest the next scenario</h1>

        <div className="mt-8">
          {result?.ok ? (
            <div className="rounded-2xl bg-white p-5 text-dba-ink">
              <p className="font-display text-2xl">Thanks — scenario submitted</p>
              <p className="mt-3 text-sm">
                Watch issue #{result.issueNumber} to see the Oz triage agent review it.
              </p>
              <a
                className="mt-5 inline-block rounded-full bg-dba-purple-500 px-5 py-3 text-white"
                href={result.issueUrl}
              >
                Watch on GitHub
              </a>
            </div>
          ) : (
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
                    setGithubUsername(event.target.value);
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
                <span className="text-sm font-medium">Scenario</span>
                <textarea
                  className="mt-1 min-h-44 w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-black"
                  maxLength={2000}
                  minLength={10}
                  name="prompt"
                  placeholder="You're trapped in..."
                  required
                />
              </label>
              {result?.ok === false ? (
                <p className="rounded-xl bg-red-500/30 px-3 py-2 text-sm">{result.error}</p>
              ) : null}
              <button
                className="font-display w-full rounded-full bg-dba-yellow px-6 py-3 text-xl text-dba-ink disabled:opacity-60"
                disabled={submitDisabled}
                type="submit"
              >
                {isSubmitting ? "Submitting..." : "Submit scenario"}
              </button>
            </Form>
          )}
        </div>
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
        Suggesting as <span className="font-medium">{check.name}</span>.
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
