import { type CommonTriggerOptions, registerEvent } from "../runtimeSupport.ts";

export interface WebhookEvent {
  method: string;
  urlParams: Record<string, string>;
  headers: Record<string, string>;
  bodyText?: string;
}

export interface WebhookAPI {
  onWebhook(fn: (event: WebhookEvent) => void, options?: CommonTriggerOptions): void;
}

export function createAPI(): WebhookAPI {
  return {
    onWebhook(fn, options?): void {
      registerEvent("webhook", fn, options);
    },
  };
}
