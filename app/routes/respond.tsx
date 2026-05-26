import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  buildGitHubJoinUrl,
  createResponseIssue,
  getScenario,
} from "../github.server";
import {
  cleanInput,
  enforceSubmissionRateLimit,
  isHoneypotFilled,
  type SubmissionResult,
  validateDisplayName,
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
    githubFallbackUrl: buildGitHubJoinUrl(scenarioNumber),
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

  const displayName = cleanInput(formData.get("displayName"));
  const response = cleanInput(formData.get("response"));
  const validationError =
    validateDisplayName(displayName) || validateLongText(response, "Response");
  if (validationError) return { ok: false, error: validationError };

  try {
    const issue = await createResponseIssue({ scenarioNumber, displayName, response });
    return { ok: true, issueNumber: issue.number, issueUrl: issue.url };
  } catch (error) {
    console.error("Could not create response issue:", error);
    return { ok: false, error: "Could not create the GitHub issue. Try the GitHub fallback link." };
  }
}

export default function Respond() {
  const { scenarioNumber, scenario, githubFallbackUrl } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <SubmissionShell title={`Respond to scenario #${scenarioNumber}`}>
      {scenario ? (
        <div className="mb-5 rounded-2xl bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-dba-yellow">Prompt</p>
          <p className="mt-2 text-lg">{scenario.prompt}</p>
        </div>
      ) : (
        <p className="mb-5 rounded-2xl bg-white/10 p-4 text-sm text-white/80">
          Scenario prompt not loaded, but your response will still link to #{scenarioNumber}.
        </p>
      )}

      {result?.ok ? (
        <SuccessResult
          issueNumber={result.issueNumber}
          issueUrl={result.issueUrl}
          message="Your response is in GitHub. Watch the issue for the Oz judge agent's progress comment and verdict."
        />
      ) : (
        <SubmissionForm
          textName="response"
          textLabel="Survival plan"
          textPlaceholder="I would..."
          submitLabel={isSubmitting ? "Submitting..." : "Submit response"}
          error={result?.ok === false ? result.error : null}
          disabled={isSubmitting}
        />
      )}

      <FallbackLink href={githubFallbackUrl}>Open GitHub form instead</FallbackLink>
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

function SubmissionForm({
  textName,
  textLabel,
  textPlaceholder,
  submitLabel,
  error,
  disabled,
}: {
  textName: string;
  textLabel: string;
  textPlaceholder: string;
  submitLabel: string;
  error: string | null;
  disabled: boolean;
}) {
  return (
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
        disabled={disabled}
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

function FallbackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="mt-6 inline-block text-sm text-white/70 underline" href={href}>
      {children}
    </a>
  );
}
