import { z } from "zod";

export const logiConfigSchema = z.object({
  orgId: z.string().trim().min(1, "Org ID is required"),
  certPem: z.string().trim().min(1, "Client certificate is required"),
  keyPem: z.string().trim().min(1, "Private key is required"),
  apiServer: z.string().trim().url().default("https://api.sync.logitech.com/v1"),
});

export type LogiConfigInput = z.infer<typeof logiConfigSchema>;
