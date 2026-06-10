import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createLogiSyncClient } from "@/lib/integrations/logi-sync-client";

beforeEach(() => mockFetch.mockReset());

describe("createLogiSyncClient", () => {
  const opts = {
    apiServer: "https://api.sync.logitech.com/v1",
    orgId: "org-1",
    certPem: "CERT",
    keyPem: "KEY",
  };

  it("builds org-scoped URLs and parses JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ places: [] }), { status: 200 })
    );
    const client = createLogiSyncClient(opts);
    const data = await client.get<{ places: unknown[] }>("/places");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sync.logitech.com/v1/org-1/places",
      expect.objectContaining({ method: "GET" })
    );
    expect(data.places).toEqual([]);
  });

  it("strips a trailing slash from apiServer when building URLs", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = createLogiSyncClient({ ...opts, apiServer: "https://api.sync.logitech.com/v1/" });
    await client.get("/places");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sync.logitech.com/v1/org-1/places",
      expect.anything()
    );
  });

  it("sends JSON bodies on post", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = createLogiSyncClient(opts);
    await client.post("/devices/dev-1/commands", { command: "reboot" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sync.logitech.com/v1/org-1/devices/dev-1/commands");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ command: "reboot" });
  });

  it("throws on non-2xx with status in the message", async () => {
    mockFetch.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const client = createLogiSyncClient(opts);
    await expect(client.get("/places")).rejects.toThrow(/403/);
  });
});
