import { z } from "zod";

export const WebhookEvent = z.object({
  method: z.string(),
  urlParams: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  bodyText: z.string().optional(),
});
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export const TriggerEvent = z.object({
  type: z.literal("webhook"),
  label: z.string(),
  data: WebhookEvent,
});
export type TriggerEvent = z.infer<typeof TriggerEvent>;

export interface RegisteredTrigger {
  label: string;
  type: string;
}
