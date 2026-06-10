import crypto from "crypto";

export class YmcsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "YmcsApiError";
  }
}

interface YmcsHeaders extends Record<string, string> {
  authorization: string;
  timestamp: string;
  nonce: string;
  "content-type": string;
}

export interface YmcsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export function buildYmcsHeaders(authorization: string): YmcsHeaders {
  return {
    authorization,
    timestamp: Date.now().toString(),
    nonce: crypto.randomBytes(12).toString("hex"), // 24 hex chars, well under 32
    "content-type": "application/json",
  };
}

// YMCS docs suggest a 30 s minimum delay between retries, but serverless
// route timeouts make that impractical — we cap honored Retry-After at 25 s
// and use 1 s / 4 s exponential backoff otherwise.
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 2; // 3 total attempts (1 initial + 2 retries)
const BACKOFF_DELAYS_MS = [1000, 4000] as const;
const JITTER_FACTOR = 0.2; // ±20%
const MAX_RETRY_AFTER_S = 25;

function withJitter(ms: number): number {
  const spread = ms * JITTER_FACTOR;
  return ms + (Math.random() * 2 - 1) * spread;
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader !== null) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds >= 0 && seconds <= MAX_RETRY_AFTER_S) {
      return seconds * 1000;
    }
  }
  const base = BACKOFF_DELAYS_MS[attempt] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
  return withJitter(base);
}

async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  errorMessage: (status: number) => string
): Promise<Response> {
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await doFetch();

    if (res.status !== 429) {
      return res;
    }

    lastRes = res;

    if (attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }

  // All attempts exhausted on 429 — consume body and throw
  const body = await (lastRes as Response).text();
  throw new YmcsApiError(errorMessage((lastRes as Response).status), (lastRes as Response).status, body);
}

export async function acquireYmcsToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<YmcsTokenResponse> {
  const credential = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetchWithRetry(
    () =>
      fetch(`${baseUrl}/v2/token`, {
        method: "POST",
        headers: buildYmcsHeaders(`Basic ${credential}`),
        body: JSON.stringify({ grant_type: "client_credentials" }),
      }),
    (status) => `YMCS token request failed: ${status}`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new YmcsApiError(`YMCS token request failed: ${res.status}`, res.status, body);
  }

  return (await res.json()) as YmcsTokenResponse;
}

export async function ymcsPost<T>(
  baseUrl: string,
  path: string,
  token: string,
  body: unknown
): Promise<T> {
  const res = await fetchWithRetry(
    () =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: buildYmcsHeaders(`Bearer ${token}`),
        body: JSON.stringify(body),
      }),
    (status) => `YMCS POST ${path} failed: ${status}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new YmcsApiError(`YMCS POST ${path} failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}

export async function ymcsGet<T>(
  baseUrl: string,
  path: string,
  token: string
): Promise<T> {
  const res = await fetchWithRetry(
    () =>
      fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: buildYmcsHeaders(`Bearer ${token}`),
      }),
    (status) => `YMCS GET ${path} failed: ${status}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new YmcsApiError(`YMCS GET ${path} failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}
