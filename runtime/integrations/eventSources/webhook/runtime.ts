import { z } from "zod";
import { CommonTriggerOptions, registerEvent } from "../runtimeSupport.ts";

export const WebhookEvent = z.object({
  method: z.string(),
  urlParams: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  bodyText: z.string().optional(),
});
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export function onWebhook(fn: (event: WebhookEvent) => void, options?: CommonTriggerOptions): void {
  registerEvent("webhook", fn, WebhookEvent, options);
}
