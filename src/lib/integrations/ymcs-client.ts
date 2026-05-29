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

export async function acquireYmcsToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<YmcsTokenResponse> {
  const credential = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${baseUrl}/v2/token`, {
    method: "POST",
    headers: buildYmcsHeaders(`Basic ${credential}`),
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

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
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildYmcsHeaders(`Bearer ${token}`),
    body: JSON.stringify(body),
  });

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
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: buildYmcsHeaders(`Bearer ${token}`),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new YmcsApiError(`YMCS GET ${path} failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}
