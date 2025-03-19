import { type CommonTriggerOptions, registerEvent } from "../runtimeSupport.ts";

export interface GmailMessageEvent {
  type: "messageAdded";
  subject: string;
}

export interface GmailAPI {
  onMessage(fn: (event: GmailMessageEvent) => void, options?: CommonTriggerOptions): void;
}

export function createAPI(): GmailAPI {
  return {
    onMessage(fn: (event: GmailMessageEvent) => void, options?: CommonTriggerOptions): void {
      registerEvent("gmail", fn, options);
    },
  };
}
