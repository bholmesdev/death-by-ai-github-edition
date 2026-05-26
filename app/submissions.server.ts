import type { ActionFunctionArgs } from "react-router";

type RateEntry = {
  count: number;
  resetAt: number;
};

export type SubmissionResult =
  | {
      ok: true;
      issueNumber: number;
      issueUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

const memoryRateLimits = new Map<string, RateEntry>();
const rateLimitWindowSeconds = 60;
const rateLimitMaxSubmissions = 5;

export function cleanInput(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function validateDisplayName(displayName: string) {
  if (displayName.length < 1) return "Enter a name.";
  if (displayName.length > 40) return "Name must be 40 characters or fewer.";
  return null;
}

export function validateLongText(value: string, label: string) {
  if (value.length < 10) return `${label} must be at least 10 characters.`;
  if (value.length > 2000) return `${label} must be 2000 characters or fewer.`;
  return null;
}

export function isHoneypotFilled(formData: FormData) {
  return cleanInput(formData.get("website")).length > 0;
}

export async function enforceSubmissionRateLimit(request: ActionFunctionArgs["request"]) {
  const key = `death-by-ai:submit:${clientAddress(request)}`;
  const upstash = await enforceUpstashRateLimit(key);
  if (upstash !== null) return upstash;
  return enforceMemoryRateLimit(key);
}

async function enforceUpstashRateLimit(key: string): Promise<string | null | undefined> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const count = Number(await upstashCommand(url, token, ["INCR", key]));
    if (count === 1) {
      await upstashCommand(url, token, ["EXPIRE", key, String(rateLimitWindowSeconds)]);
    }
    return count > rateLimitMaxSubmissions
      ? "Too many submissions. Please wait a minute and try again."
      : undefined;
  } catch (error) {
    console.error("Rate limit KV check failed; falling back to in-memory limit:", error);
    return null;
  }
}

async function upstashCommand(url: string, token: string, command: string[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`Upstash ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result;
}

function enforceMemoryRateLimit(key: string) {
  const now = Date.now();
  const existing = memoryRateLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryRateLimits.set(key, {
      count: 1,
      resetAt: now + rateLimitWindowSeconds * 1000,
    });
    return undefined;
  }

  existing.count += 1;
  return existing.count > rateLimitMaxSubmissions
    ? "Too many submissions. Please wait a minute and try again."
    : undefined;
}

function clientAddress(request: ActionFunctionArgs["request"]) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
