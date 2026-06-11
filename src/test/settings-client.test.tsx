import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsClient } from "@/app/(app)/settings/SettingsClient";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
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
      .closest("div") as HTMLElement;
    const saveButton = Array.from(card.querySelectorAll("button")).find((b) =>
      /save/i.test(b.textContent ?? "")
    ) as HTMLButtonElement;
    await user.click(saveButton);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as { platform: string; apiKey: string; config: Record<string, string> };
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
      .closest("div") as HTMLElement;
    const saveButton = Array.from(logiCard.querySelectorAll("button")).find((b) =>
      /save/i.test(b.textContent ?? "")
    ) as HTMLButtonElement;
    await user.click(saveButton);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/integrations",
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as { platform: string; config: Record<string, string> };
    expect(body.platform).toBe("LOGITECH_SYNC");
    expect(body.config).toMatchObject({
      orgId: "org-1",
      certPem: "CERTPEM",
      keyPem: "KEYPEM",
    });
  });
});
