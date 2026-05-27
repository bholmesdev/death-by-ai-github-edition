import { createSign } from "node:crypto";

import type { ResponseVerdict, Scenario, Verdict } from "./game.server";

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  labels: Array<{ name: string } | string>;
};

type GitHubComment = {
  body: string | null;
  created_at: string;
  user: {
    login: string;
  } | null;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const defaultRepository = "warpdotdev-demos/death-by-ai-github-edition";
const repository = process.env.GITHUB_REPOSITORY || process.env.WORKFLOW_CODE_REPOSITORY || defaultRepository;
const [owner, repo] = repository.split("/");
const apiBase = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
const webBase = process.env.GITHUB_SERVER_URL || "https://github.com";
const token = process.env.GITHUB_TOKEN;
const cache = new Map<string, CacheEntry<unknown>>();
const scenarioLabel = "game:scenario";
const responseLabel = "game:response";

export async function getApprovedScenarios(): Promise<Scenario[]> {
  return withGitHubFallback("approved scenarios", [], () =>
    cached("scenarios", 7000, async () => {
      const issues = await listIssues([scenarioLabel, "scenario:approved"]);
      const responseCounts = await getResponseCountsByScenario();

      return issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        prompt: cleanScenarioPrompt(issue.body, issue.title),
        responseCount: responseCounts.get(issue.number) ?? 0,
      }));
    }),
  );
}

export async function getReadyResponses(scenarioNumber: number): Promise<ResponseVerdict[]> {
  return withGitHubFallback("ready responses", [], () =>
    cached(`responses:${scenarioNumber}`, 3000, async () => {
      const issues = await listIssues([responseLabel]);
      const matching = issues.filter((issue) => parseScenarioNumber(issue.body) === scenarioNumber);
      const ready = matching.filter((issue) => getVerdict(issue) !== null);
      const responses = await Promise.all(ready.map(toResponseVerdict));

      return responses
        .filter((response): response is ResponseVerdict => response !== null)
        .sort((a, b) => a.arrivedAt - b.arrivedAt);
    }),
  );
}

export async function getResponseCountsByScenario(): Promise<Map<number, number>> {
  const counts = await withGitHubFallback("response counts", [], () =>
    cached("response-counts", 10000, async () => {
      const issues = await listIssues([responseLabel]);
      const nextCounts = new Map<number, number>();

      for (const issue of issues) {
        const scenarioNumber = parseScenarioNumber(issue.body);
        if (!scenarioNumber) continue;
        nextCounts.set(scenarioNumber, (nextCounts.get(scenarioNumber) ?? 0) + 1);
      }

      return [...nextCounts.entries()];
    }),
  );

  return new Map(counts);
}

export function buildJoinUrl(scenario: Scenario, origin?: string) {
  return appUrl(`/respond/${scenario.number}`, origin);
}

export function buildGitHubJoinUrl(scenarioNumber: number) {
  // Pre-fill issue form fields by id. GitHub ignores `body=` when `template=` is set.
  const params = new URLSearchParams({
    template: "response.yml",
    labels: responseLabel,
    title: `Response to #${scenarioNumber}`,
    scenario: `#${scenarioNumber}`,
    plan: "",
  });

  return `${webBase}/${owner}/${repo}/issues/new?${params}`;
}

export function getRepoUrl() {
  return `${webBase}/${owner}/${repo}`;
}

export function buildSuggestPromptUrl(origin?: string) {
  return appUrl("/suggest", origin);
}

export function buildGitHubSuggestPromptUrl() {
  const params = new URLSearchParams({
    template: "scenario.yml",
    labels: scenarioLabel,
    title: "Scenario: ",
    prompt: "",
  });

  return `${webBase}/${owner}/${repo}/issues/new?${params}`;
}

export type CreatedIssue = {
  number: number;
  url: string;
};

export async function getScenario(scenarioNumber: number): Promise<Scenario | null> {
  const scenarios = await getApprovedScenarios();
  return scenarios.find((scenario) => scenario.number === scenarioNumber) ?? null;
}

export async function createResponseIssue(input: {
  scenarioNumber: number;
  displayName: string;
  response: string;
}): Promise<CreatedIssue> {
  return createIssue({
    title: `Response to #${input.scenarioNumber} from ${input.displayName}`,
    body: [
      "### Scenario",
      "",
      `#${input.scenarioNumber}`,
      "",
      "### Player",
      "",
      input.displayName,
      "",
      "### Survival plan",
      "",
      input.response,
    ].join("\n"),
    labels: [responseLabel],
  });
}

export async function createScenarioIssue(input: {
  displayName: string;
  prompt: string;
}): Promise<CreatedIssue> {
  return createIssue({
    title: `Scenario: ${truncateForTitle(input.prompt)}`,
    body: ["### Prompt", "", input.prompt, "", "### Suggested by", "", input.displayName].join("\n"),
    labels: [scenarioLabel],
  });
}

async function toResponseVerdict(issue: GitHubIssue): Promise<ResponseVerdict | null> {
  const verdict = getVerdict(issue);
  const scenarioNumber = parseScenarioNumber(issue.body);
  if (!verdict || !scenarioNumber) return null;

  const comment = await getVerdictComment(issue.number, verdict);

  return {
    id: String(issue.number),
    issueNumber: issue.number,
    scenarioNumber,
    playerName: issue.user?.login ?? "Anonymous",
    avatarUrl: issue.user?.avatar_url ?? "",
    body: cleanVerdictBody(comment?.body ?? issue.body ?? ""),
    verdict,
    arrivedAt: Date.parse(comment?.created_at ?? issue.created_at),
  };
}

async function applyIssueLabels(issueNumber: number, labels: string[]) {
  if (!labels.length) return;
  await writeRequest<{ labels: GitHubIssue["labels"] }>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      method: "POST",
      body: JSON.stringify({ labels }),
    },
  );
}

async function getVerdictComment(issueNumber: number, verdict: Verdict) {
  const comments = await cached(`comments:${issueNumber}`, 3000, () =>
    request<GitHubComment[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`),
  );
  const verdictWord = verdict === "survived" ? "survived" : "died";

  return [...comments]
    .reverse()
    .find((comment) => comment.body?.toLowerCase().includes(verdictWord));
}

async function listIssues(labels: string[]) {
  // TODO: follow GitHub pagination once the event repo can exceed 100 open issues.
  const params = new URLSearchParams({
    state: "open",
    labels: labels.join(","),
    per_page: "100",
    sort: "created",
    direction: "desc",
  });

  return request<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?${params}`);
}

async function request<T>(path: string): Promise<T> {
  if (!owner || !repo) throw new Error(`Invalid GitHub repository: ${repository}`);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "death-by-ai-projector",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBase}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

async function createIssue(input: {
  title: string;
  body: string;
  labels: string[];
}): Promise<CreatedIssue> {
  const created = await writeRequest<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  await applyIssueLabels(created.number, input.labels);

  cache.clear();
  return {
    number: created.number,
    url: created.html_url,
  };
}

async function writeRequest<T>(
  path: string,
  init: {
    method: string;
    body: string;
  },
): Promise<T> {
  if (!owner || !repo) throw new Error(`Invalid GitHub repository: ${repository}`);

  const writeToken = await getWriteToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${writeToken}`,
      "Content-Type": "application/json",
      "User-Agent": "death-by-ai-projector",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

let cachedWriteToken: CacheEntry<string> | null = null;

async function getWriteToken() {
  if (cachedWriteToken && cachedWriteToken.expiresAt > Date.now()) return cachedWriteToken.value;

  const installationToken = await getInstallationToken();
  if (installationToken) {
    cachedWriteToken = {
      value: installationToken.token,
      expiresAt: Date.parse(installationToken.expiresAt) - 60_000,
    };
    return installationToken.token;
  }

  if (token) return token;
  throw new Error(
    "GitHub issue creation requires GITHUB_TOKEN or GitHub App env: OZ_GITHUB_APP_ID, OZ_GITHUB_APP_PRIVATE_KEY, and OZ_GITHUB_APP_INSTALLATION_ID.",
  );
}

async function getInstallationToken(): Promise<{ token: string; expiresAt: string } | null> {
  const appId = process.env.OZ_GITHUB_APP_ID || process.env.GITHUB_APP_ID || "";
  const privateKey = process.env.OZ_GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY || "";
  const installationId =
    process.env.OZ_GITHUB_APP_INSTALLATION_ID || process.env.GITHUB_APP_INSTALLATION_ID || "";
  if (!appId || !privateKey || !installationId) return null;

  const response = await fetch(`${apiBase}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${buildAppJwt(appId, privateKey)}`,
      "User-Agent": "death-by-ai-projector",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub App token exchange failed ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { token?: string; expires_at?: string };
  if (!data.token || !data.expires_at) throw new Error("GitHub App token exchange returned no token");
  return { token: data.token, expiresAt: data.expires_at };
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) return entry.value;

  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function withGitHubFallback<T>(label: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`Could not load GitHub ${label}:`, error);
    return fallback;
  }
}

function cleanScenarioPrompt(body: string | null, fallback: string) {
  const text = (body ?? "").trim();
  const lines = text.split(/\r?\n/);
  const promptLineIndex = lines.findIndex((line) => /^#{0,6}\s*prompt:?\s*$/i.test(line.trim()));
  const inlinePrompt = lines
    .map((line) => line.trim().match(/^#{0,6}\s*prompt:\s*(.+)$/i)?.[1])
    .find((value): value is string => Boolean(value));
  const prompt =
    inlinePrompt ??
    (promptLineIndex >= 0
      ? lines
          .slice(promptLineIndex + 1)
          .filter((line) => !/^#{1,6}\s+/.test(line.trim()))
          .join("\n")
      : lines.filter((line) => !/^#{1,6}\s+/.test(line.trim())).join("\n"));

  return (prompt.trim() || fallback).trim();
}

function cleanVerdictBody(body: string) {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#+\s+.*$/gm, "")
    .trim();
}

function parseScenarioNumber(body: string | null) {
  const match =
    body?.match(/responds-to:\s*#?(\d+)/i) ??
    body?.match(/###\s*Scenario\s*\n+\s*#?(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getVerdict(issue: GitHubIssue): Verdict | null {
  const labels = issue.labels.map((label) => (typeof label === "string" ? label : label.name));
  if (labels.includes("verdict:survived")) return "survived";
  if (labels.includes("verdict:died")) return "died";
  return null;
}

function buildAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(normalizePrivateKey(privateKey));
  return `${signingInput}.${base64Url(signature)}`;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

function truncateForTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 70 ? `${normalized.slice(0, 67)}...` : normalized;
}

function appUrl(path: string, origin?: string) {
  const appOrigin = origin || process.env.PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!appOrigin) return path;
  return new URL(path, appOrigin.startsWith("http") ? appOrigin : `https://${appOrigin}`).toString();
}
