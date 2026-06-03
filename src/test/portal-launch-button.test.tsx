import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalLaunchButton } from "@/app/(app)/tickets/[id]/PortalLaunchButton";
import type { PortalLink } from "@/lib/portal-links";

const deepLink: PortalLink = {
  url: "https://lens.poly.com/devices/dev-1",
  isDeepLink: true,
  label: "Open in Poly Lens",
};
const homeLink: PortalLink = {
  url: "https://pulse.neat.no",
  isDeepLink: false,
  label: "Open in Neat Pulse",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "a1" } }) }),
  );
});

describe("PortalLaunchButton", () => {
  it("renders an external anchor to the deep link with safe rel", () => {
    render(<PortalLaunchButton ticketId="t1" portalLink={deepLink} />);
    const link = screen.getByRole("link", { name: /Open in Poly Lens/ });
    expect(link).toHaveAttribute("href", "https://lens.poly.com/devices/dev-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows a (portal home) hint when the link is not a deep link", () => {
    render(<PortalLaunchButton ticketId="t1" portalLink={homeLink} />);
    expect(screen.getByText("(portal home)")).toBeInTheDocument();
  });

  it("posts a PORTAL_LAUNCH audit action on click", async () => {
    render(<PortalLaunchButton ticketId="t-7" portalLink={deepLink} />);
    await userEvent.click(screen.getByRole("link", { name: /Open in Poly Lens/ }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/tickets/t-7/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "PORTAL_LAUNCH", body: "Poly Lens · device deep-link" }),
      }),
    );
  });

  it("invokes onLogged with the server action", async () => {
    const onLogged = vi.fn();
    render(<PortalLaunchButton ticketId="t1" portalLink={deepLink} onLogged={onLogged} />);
    await userEvent.click(screen.getByRole("link", { name: /Open in Poly Lens/ }));
    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledWith({ id: "a1" }));
  });
});
