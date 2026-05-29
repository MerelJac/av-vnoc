import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/yealink/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/integrations/yealink", () => ({
  createYealinkAdapter: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    alert: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/correlation", () => ({
  processAlert: vi.fn(),
}));

vi.mock("@/lib/sse-bus", () => ({
  emitSseEvent: vi.fn(),
}));

import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { prisma } from "@/lib/prisma";
import { processAlert } from "@/lib/correlation";
import { emitSseEvent } from "@/lib/sse-bus";

const mockCreateAdapter = vi.mocked(createYealinkAdapter);
const mockProcessAlert = vi.mocked(processAlert);
const mockFindEvent = vi.mocked(prisma.webhookEvent.findUnique);
const mockCreateEvent = vi.mocked(prisma.webhookEvent.create);
const mockUpdateEvent = vi.mocked(prisma.webhookEvent.update);
const mockFindAlert = vi.mocked(prisma.alert.findFirst);
const mockUpdateAlert = vi.mocked(prisma.alert.update);
const mockCreateLog = vi.mocked(prisma.activityLog.create);
const mockEmitSse = vi.mocked(emitSseEvent);

const VALID_BODY = {
  events: [
    {
      id: "event-uuid-1",
      type: "alarm.created",
      createTime: 1600063609555,
      partyId: "enterprise-id",
      data: {
        id: "alarm-id-1",
        event: "Offline",
        mac: "001565aabbcc",
        model: "SIP-T54S",
      },
    },
  ],
};

function makeRequest(body: unknown, authHeader = "verify-token-abc") {
  return new NextRequest("http://localhost/api/webhooks/yealink", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: authHeader,
    },
  });
}

const MOCK_ADAPTER = {
  verifyWebhookSignature: vi.fn((_, sig: string) => sig === "verify-token-abc"),
  normalizeWebhookPayload: vi.fn().mockReturnValue(null),
  syncDevices: vi.fn(),
  fetchRecentAlerts: vi.fn(),
  rebootDevice: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCreateAdapter.mockResolvedValue(MOCK_ADAPTER as never);
  mockFindEvent.mockResolvedValue(null);
  mockCreateEvent.mockResolvedValue({ id: "db-event-1" } as never);
  mockUpdateEvent.mockResolvedValue({} as never);
  mockCreateLog.mockResolvedValue({} as never);
  mockProcessAlert.mockResolvedValue({ action: "created", alertId: "a1", ticketId: "t1" });
});

describe("POST /api/webhooks/yealink", () => {
  it("returns 401 when authorization token is wrong", async () => {
    const req = makeRequest(VALID_BODY, "wrong-token");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockProcessAlert).not.toHaveBeenCalled();
  });

  it("returns 503 when adapter cannot be initialized", async () => {
    mockCreateAdapter.mockRejectedValueOnce(new Error("creds missing"));
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/yealink", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json", authorization: "verify-token-abc" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is missing events array", async () => {
    const req = makeRequest({ foo: "bar" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("deduplicates events already in WebhookEvent table", async () => {
    mockFindEvent.mockResolvedValueOnce({ id: "existing" } as never);
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).not.toHaveBeenCalled();
  });

  it("calls processAlert for alarm.created with correct NormalizedAlert", async () => {
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).toHaveBeenCalledOnce();
    const alertArg = mockProcessAlert.mock.calls[0][0];
    expect(alertArg.platform).toBe("YEALINK_YMCS");
    expect(alertArg.platformAlertId).toBe("alarm-id-1");
    expect(alertArg.platformDeviceId).toBe("001565aabbcc");
    expect(alertArg.severity).toBe("HIGH");
    expect(alertArg.title).toContain("Offline");
    expect(alertArg.title).toContain("SIP-T54S");
  });

  it("resolves existing alert for alarm.recovered", async () => {
    const recoveryBody = {
      events: [
        {
          id: "event-uuid-2",
          type: "alarm.recovered",
          createTime: 1600063700000,
          partyId: "enterprise-id",
          data: { id: "alarm-id-1", event: "Online", mac: "001565aabbcc", model: "SIP-T54S" },
        },
      ],
    };

    mockFindAlert.mockResolvedValueOnce({ id: "alert-db-1", status: "ACTIVE" } as never);

    const req = makeRequest(recoveryBody);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockProcessAlert).not.toHaveBeenCalled();
    expect(mockUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "alert-db-1" },
        data: expect.objectContaining({ status: "RESOLVED" }),
      })
    );
    expect(mockCreateLog).toHaveBeenCalled();
    expect(mockEmitSse).toHaveBeenCalledWith("alert_resolved", expect.objectContaining({ id: "alert-db-1" }));
    expect(mockEmitSse).toHaveBeenCalledWith("kpi_updated", {});
  });

  it("handles alarm.recovered gracefully when no matching alert found", async () => {
    const recoveryBody = {
      events: [
        {
          id: "event-uuid-3",
          type: "alarm.recovered",
          createTime: 1600063700000,
          partyId: "enterprise-id",
          data: { id: "nonexistent-alarm", event: "Online", mac: "001565aabbcc", model: "SIP-T54S" },
        },
      ],
    };
    mockFindAlert.mockResolvedValueOnce(null);

    const req = makeRequest(recoveryBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdateAlert).not.toHaveBeenCalled();
  });

  it("ignores unknown event types without error", async () => {
    const unknownBody = {
      events: [
        {
          id: "event-uuid-4",
          type: "device.updated",
          createTime: 1600063700000,
          partyId: "enterprise-id",
          data: { id: "something", event: "Updated", mac: "001565aabbcc", model: "X" },
        },
      ],
    };

    const req = makeRequest(unknownBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).not.toHaveBeenCalled();
  });

  it("processes multiple events in one request", async () => {
    const multiBody = {
      events: [
        {
          id: "evt-1",
          type: "alarm.created",
          createTime: 1600063609555,
          partyId: "enterprise-id",
          data: { id: "alarm-1", event: "Offline", mac: "aabbcc001122", model: "SIP-T54S" },
        },
        {
          id: "evt-2",
          type: "alarm.created",
          createTime: 1600063609600,
          partyId: "enterprise-id",
          data: { id: "alarm-2", event: "Offline", mac: "ddeeff334455", model: "SIP-T54S" },
        },
      ],
    };

    const req = makeRequest(multiBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).toHaveBeenCalledTimes(2);
  });
});
