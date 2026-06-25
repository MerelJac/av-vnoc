import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsClient } from "@/app/(app)/settings/SettingsClient";

const mockFetch = vi.fn();

/** Find the PUT /api/integrations call (GET-on-mount fires first). */
function putBody<T>(): T {
  const call = mockFetch.mock.calls.find(
    ([url, init]) => url === "/api/integrations" && (init as RequestInit | undefined)?.method === "PUT"
  );
  if (!call) throw new Error("no PUT /api/integrations call recorded");
  return JSON.parse((call[1] as RequestInit).body as string) as T;
}

/** Default fetch mock: GET returns no saved creds, PUT/POST succeed. */
function defaultFetch(url: string, init?: RequestInit) {
  if (url === "/api/integrations" && (!init || init.method === undefined || init.method === "GET")) {
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
  }
  if (url === "/api/integrations/sync") {
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, synced: 0, errors: [] }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(defaultFetch);
  vi.stubGlobal("fetch", mockFetch);
});

describe("SettingsClient — Utelogy card", () => {
  it("renders the Utelogy section and submits apiKey + baseUrl", async () => {
    const user = userEvent.setup();
    render(<SettingsClient />);

    expect(screen.getByRole("heading", { name: "Utelogy" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^API Key/), "ute-key-1");
    await user.type(screen.getByLabelText(/Instance Base URL/), "https://acme.utelogy.com");

    const card = screen
      .getByRole("heading", { name: "Utelogy" })
      .closest("div.rounded-xl") as HTMLElement;
    const saveButton = Array.from(card.querySelectorAll("button")).find((b) =>
      /save/i.test(b.textContent ?? "")
    ) as HTMLButtonElement;
    await user.click(saveButton);

    const body = putBody<{ platform: string; apiKey: string; config: Record<string, string> }>();
    expect(body.platform).toBe("UTELOGY");
    expect(body.apiKey).toBe("ute-key-1");
    expect(body.config).toMatchObject({ baseUrl: "https://acme.utelogy.com" });
  });
});

describe("SettingsClient — Logitech Sync card", () => {
  it("shows where credentials come from and the two-certificate account limit", () => {
    render(<SettingsClient />);

    expect(
      screen.getByText(/Sync Portal → Settings → Sync Cloud API/)
    ).toBeInTheDocument();
    expect(screen.getByText(/two certificates/i)).toBeInTheDocument();
  });

  it("renders the Logitech Sync section with PEM textareas", () => {
    render(<SettingsClient />);

    expect(screen.getByRole("heading", { name: "Logitech Sync" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Org ID/)).toBeInTheDocument();

    const cert = screen.getByLabelText(/Client Certificate/);
    const key = screen.getByLabelText(/Private Key/);
    expect(cert.tagName).toBe("TEXTAREA");
    expect(key.tagName).toBe("TEXTAREA");
  });

  it("submits Logitech config (orgId + PEMs) to /api/integrations", async () => {
    const user = userEvent.setup();
    render(<SettingsClient />);

    await user.type(screen.getByLabelText(/Org ID/), "org-1");
    await user.type(screen.getByLabelText(/Client Certificate/), "CERTPEM");
    await user.type(screen.getByLabelText(/Private Key/), "KEYPEM");

    const logiCard = screen
      .getByRole("heading", { name: "Logitech Sync" })
      .closest("div.rounded-xl") as HTMLElement;
    const saveButton = Array.from(logiCard.querySelectorAll("button")).find((b) =>
      /save/i.test(b.textContent ?? "")
    ) as HTMLButtonElement;
    await user.click(saveButton);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/integrations",
      expect.objectContaining({ method: "PUT" })
    );
    const body = putBody<{ platform: string; config: Record<string, string> }>();
    expect(body.platform).toBe("LOGITECH_SYNC");
    expect(body.config).toMatchObject({
      orgId: "org-1",
      certPem: "CERTPEM",
      keyPem: "KEYPEM",
    });
  });
});

describe("SettingsClient — loads existing credentials on mount", () => {
  beforeEach(() => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/integrations" && (!init || init.method === undefined || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                platform: "POLY_LENS",
                clientId: "poly-client-abc",
                clientSecret: "••••••••",
                apiKey: null,
                webhookSecret: null,
                config: { tenantId: "tenant-123", lastPolledAt: "2026-05-29T00:00:00.000Z" },
              },
              {
                platform: "LOGITECH_SYNC",
                clientId: null,
                clientSecret: null,
                apiKey: null,
                webhookSecret: null,
                config: { orgId: "org-xyz", hasCert: true },
              },
            ],
          }),
        });
      }
      return defaultFetch(url, init);
    });
  });

  it("prefills non-secret fields (clientId, tenantId, orgId)", async () => {
    render(<SettingsClient />);

    await waitFor(() =>
      expect(screen.getByLabelText(/Client ID/, { selector: "#POLY_LENS-clientId" })).toHaveValue(
        "poly-client-abc"
      )
    );
    expect(screen.getByLabelText(/Tenant ID/)).toHaveValue("tenant-123");
    expect(screen.getByLabelText(/Org ID/)).toHaveValue("org-xyz");
  });

  it("leaves saved secrets blank but marks them as saved via placeholder", async () => {
    render(<SettingsClient />);

    const secret = await screen.findByLabelText(/Client Secret/, { selector: "#POLY_LENS-clientSecret" });
    expect(secret).toHaveValue("");
    expect(secret).toHaveAttribute("placeholder", expect.stringMatching(/saved/i));

    // Logitech cert is stored (hasCert) → textarea advertises the saved state.
    const cert = screen.getByLabelText(/Client Certificate/);
    expect(cert).toHaveAttribute("placeholder", expect.stringMatching(/saved/i));
  });

  it("shows a Connected indicator for configured platforms only", async () => {
    render(<SettingsClient />);

    await waitFor(() => expect(screen.getAllByText("Connected").length).toBe(2));
    // Yealink + Utelogy have no saved creds.
    expect(screen.getAllByText("Not configured").length).toBe(2);
  });
});

describe("SettingsClient — sync devices", () => {
  it("runs a sync and reports the synced count", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/integrations/sync") {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, synced: 4, errors: [] }) });
      }
      return defaultFetch(url, init);
    });

    render(<SettingsClient />);
    await user.click(screen.getByRole("button", { name: /sync devices now/i }));

    await waitFor(() => expect(screen.getByText(/Synced 4 devices/i)).toBeInTheDocument());
  });

  it("surfaces per-adapter sync errors", async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/integrations/sync") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, synced: 1, errors: ["PolyLens adapter init failed: 401"] }),
        });
      }
      return defaultFetch(url, init);
    });

    render(<SettingsClient />);
    await user.click(screen.getByRole("button", { name: /sync devices now/i }));

    await waitFor(() =>
      expect(screen.getByText(/PolyLens adapter init failed: 401/)).toBeInTheDocument()
    );
  });
});
