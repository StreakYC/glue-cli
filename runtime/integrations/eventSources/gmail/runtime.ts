import { z } from "zod";
import { CommonTriggerOptions, registerEvent } from "../runtimeSupport.ts";

export const GmailMessageEvent = z.object({
  type: z.literal("messageAdded"),
  subject: z.string(),
});
export type GmailMessageEvent = z.infer<typeof GmailMessageEvent>;

export function onMessage(fn: (event: GmailMessageEvent) => void, options?: CommonTriggerOptions): void {
  registerEvent("gmail", fn, GmailMessageEvent, options);
}
