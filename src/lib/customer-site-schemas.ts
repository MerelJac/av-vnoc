import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(120, "Name is too long");
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const customerCreateSchema = z.object({ name });
export const customerUpdateSchema = z.object({ name });

export const siteCreateSchema = z.object({
  customerId: z.string().uuid("Invalid customer id"),
  name,
  address: optionalText(200),
  city: optionalText(120),
  state: optionalText(120),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const siteUpdateSchema = z
  .object({
    name: name.optional(),
    address: optionalText(200),
    city: optionalText(120),
    state: optionalText(120),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
