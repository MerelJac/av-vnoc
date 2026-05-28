import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { vnocBus, SseEvent } from "@/lib/sse-bus";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const [activeAlerts, openTickets] = await Promise.all([
          prisma.alert.count({ where: { status: "ACTIVE" } }),
          prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        ]);
        send("snapshot", { activeAlerts, openTickets, timestamp: new Date().toISOString() });
      } catch {
        send("snapshot", { activeAlerts: 0, openTickets: 0, timestamp: new Date().toISOString() });
      }

      const handler = (event: SseEvent) => {
        send(event.type, event.data);
      };

      vnocBus.on("event", handler);

      req.signal.addEventListener("abort", () => {
        vnocBus.off("event", handler);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
