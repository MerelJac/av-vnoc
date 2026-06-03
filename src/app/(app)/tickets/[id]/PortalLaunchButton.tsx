"use client";

import { ExternalLink } from "lucide-react";
import type { PortalLink } from "@/lib/portal-links";

interface PortalLaunchButtonProps {
  ticketId: string;
  portalLink: PortalLink;
  onLogged?: (action: unknown) => void;
}

export function PortalLaunchButton({ ticketId, portalLink, onLogged }: PortalLaunchButtonProps) {
  const platformName = portalLink.label.replace(/^Open in /, "");
  const linkKind = portalLink.isDeepLink ? "device deep-link" : "portal home";

  // Fire-and-forget audit. Must NOT preventDefault — the anchor's native
  // target="_blank" navigation opens the portal on the genuine user gesture
  // (popup-blocker safe). keepalive lets the POST complete regardless.
  function logLaunch() {
    fetch(`/api/tickets/${ticketId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "PORTAL_LAUNCH", body: `${platformName} · ${linkKind}` }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data && onLogged) onLogged(json.data);
      })
      .catch(() => {
        // Portal already opened; the audit record is best-effort.
      });
  }

  return (
    <a
      href={portalLink.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={logLaunch}
      className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-secondary-color/10 text-secondary-color hover:bg-secondary-color/20 transition-colors"
    >
      <ExternalLink className="w-4 h-4" />
      {portalLink.label}
      {!portalLink.isDeepLink && <span className="text-xs text-muted">(portal home)</span>}
    </a>
  );
}
