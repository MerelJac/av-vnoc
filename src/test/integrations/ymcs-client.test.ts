import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildYmcsHeaders,
  acquireYmcsToken,
  ymcsPost,
  ymcsGet,
  YmcsApiError,
} from "@/lib/integrations/ymcs-client";

const BASE_URL = "https://us-api.ymcs.yealink.com";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("buildYmcsHeaders", () => {
  it("includes timestamp and nonce as strings", () => {
    const headers = buildYmcsHeaders("Bearer tok");
    expect(typeof headers.timestamp).toBe("string");
    expect(headers.timestamp).toMatch(/^\d+$/);
    expect(typeof headers.nonce).toBe("string");
    expect(headers.nonce.length).toBeGreaterThan(0);
    expect(headers.nonce.length).toBeLessThanOrEqual(32);
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("produces unique nonces on each call", () => {
    const h1 = buildYmcsHeaders("Bearer tok");
    const h2 = buildYmcsHeaders("Bearer tok");
    expect(h1.nonce).not.toBe(h2.nonce);
  });
});

describe("acquireYmcsToken", () => {
  it("sends Basic auth with base64(clientId:clientSecret) + timestamp + nonce", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "jwt-tok", token_type: "bearer", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await acquireYmcsToken(BASE_URL, "my-client", "my-secret");

    expect(result.access_token).toBe("jwt-tok");
    expect(result.expires_in).toBe(86400);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v2/token`);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("my-client:my-secret").toString("base64")}`
    );
    expect((init.headers as Record<string, string>).timestamp).toMatch(/^\d+$/);
    expect((init.headers as Record<string, string>).nonce).toBeDefined();
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.grant_type).toBe("client_credentials");
  });

  it("throws YmcsApiError on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })
      )
    );
    await expect(acquireYmcsToken(BASE_URL, "bad", "creds")).rejects.toThrow(YmcsApiError);
  });
});

describe("ymcsPost", () => {
  it("sends Bearer token + timestamp + nonce + JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await ymcsPost<{ data: unknown[] }>(BASE_URL, "/v2/dm/listDevices", "tok-123", {
      skip: 0,
      limit: 10,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v2/dm/listDevices`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok-123");
    expect(headers.timestamp).toMatch(/^\d+$/);
    expect(headers.nonce).toBeDefined();
    expect(JSON.parse(init.body as string)).toEqual({ skip: 0, limit: 10 });
  });

  it("throws YmcsApiError on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
    );
    await expect(
      ymcsPost(BASE_URL, "/v2/dm/listDevices", "tok", {})
    ).rejects.toThrow(YmcsApiError);
  });
});

describe("ymcsGet", () => {
  it("sends GET with auth headers and no body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5 }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    await ymcsGet<{ total: number }>(BASE_URL, "/v2/dm/statistics/deviceCount?deviceStatus=1", "tok-456");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v2/dm/statistics/deviceCount");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-456");
  });
});
