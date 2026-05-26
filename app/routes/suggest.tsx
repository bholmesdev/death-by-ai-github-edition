import { Form, useActionData, useNavigation } from "react-router";

import { createScenarioIssue } from "../github.server";
import {
  cleanInput,
  enforceSubmissionRateLimit,
  isHoneypotFilled,
  type SubmissionResult,
  validateDisplayName,
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

  const displayName = cleanInput(formData.get("displayName"));
  const prompt = cleanInput(formData.get("prompt"));
  const validationError = validateDisplayName(displayName) || validateLongText(prompt, "Scenario");
  if (validationError) return { ok: false, error: validationError };

  try {
    const issue = await createScenarioIssue({ displayName, prompt });
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
                <span className="text-sm font-medium">Name</span>
                <input
                  className="mt-1 w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-black"
                  maxLength={40}
                  name="displayName"
                  required
                />
              </label>
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
                disabled={isSubmitting}
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
