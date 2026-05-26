import type { ResponseVerdict, Scenario, Verdict } from "./game.server";

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
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

const defaultRepository = "bholmesdev/death-by-ai-github-edition";
const repository = process.env.GITHUB_REPOSITORY || process.env.WORKFLOW_CODE_REPOSITORY || defaultRepository;
const [owner, repo] = repository.split("/");
const apiBase = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
const webBase = process.env.GITHUB_SERVER_URL || "https://github.com";
const token = process.env.GITHUB_TOKEN;
const cache = new Map<string, CacheEntry<unknown>>();

export async function getApprovedScenarios(): Promise<Scenario[]> {
  return withGitHubFallback("approved scenarios", [], () =>
    cached("scenarios", 7000, async () => {
      const issues = await listIssues(["game:scenario", "scenario:approved"]);
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
      const issues = await listIssues(["game:response"]);
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
      const issues = await listIssues(["game:response"]);
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

export function buildJoinUrl(scenario: Scenario) {
  const body = `responds-to: #${scenario.number}\n\nName:\n\nSurvival plan:\n`;
  const params = new URLSearchParams({
    template: "response.yml",
    labels: "game:response",
    title: "Response: ",
    body,
  });

  return `${webBase}/${owner}/${repo}/issues/new?${params}`;
}

export function buildSuggestPromptUrl() {
  const params = new URLSearchParams({
    template: "scenario.yml",
    labels: "game:scenario",
    title: "Scenario: ",
    body: "Prompt:\n",
  });

  return `${webBase}/${owner}/${repo}/issues/new?${params}`;
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
  const match = body?.match(/responds-to:\s*#?(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getVerdict(issue: GitHubIssue): Verdict | null {
  const labels = issue.labels.map((label) => (typeof label === "string" ? label : label.name));
  if (labels.includes("verdict:survived")) return "survived";
  if (labels.includes("verdict:died")) return "died";
  return null;
}
