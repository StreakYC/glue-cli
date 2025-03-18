import { z } from "zod";
import { CommonTriggerOptions, registerEvent } from "../runtimeSupport.ts";

export const GmailEvent = z.object({
  type: z.literal("messageAdded"),
  subject: z.string(),
});
export type GmailEvent = z.infer<typeof GmailEvent>;

export function onMessage(fn: (event: GmailEvent) => void, options?: CommonTriggerOptions): void {
  registerEvent("gmail", fn, GmailEvent, options);
}
