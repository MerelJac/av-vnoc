import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const orgConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  businessHours: z
    .object({
      start: time,
      end: time,
      days: z.array(z.number().int().min(0).max(6)).max(7),
    })
    .optional(),
});

const minutes = z.number().int().positive();
export const slaConfigSchema = z.object({
  P1: minutes,
  P2: minutes,
  P3: minutes,
  P4: minutes,
  autoResolveHours: z.number().int().positive(),
});

const priority = z.enum(["P1", "P2", "P3", "P4"]);
export const routingConfigSchema = z.object({
  severityToPriority: z.object({
    CRITICAL: priority,
    HIGH: priority,
    MEDIUM: priority,
    LOW: priority,
    INFO: priority,
  }),
});

export type OrgConfig = z.infer<typeof orgConfigSchema>;
export type SlaConfig = z.infer<typeof slaConfigSchema>;
export type RoutingConfig = z.infer<typeof routingConfigSchema>;

export const DEFAULT_SLA: SlaConfig = { P1: 60, P2: 240, P3: 480, P4: 1440, autoResolveHours: 24 };
export const DEFAULT_ROUTING: RoutingConfig = {
  severityToPriority: { CRITICAL: "P1", HIGH: "P2", MEDIUM: "P3", LOW: "P4", INFO: "P4" },
};
