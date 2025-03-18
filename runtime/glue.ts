// TODO this will be moved into glue-runtime once things are a little more
// stable.
import { z } from "zod";
import { Hono } from "hono";
import { RegisteredTrigger, TriggerEvent } from "./common.ts";
import { Log, patchConsoleGlobal, runInLoggingContext } from "./logging.ts";
import { onMessage } from "./integrations/eventSources/gmail/runtime.ts";
import { onWebhook } from "./integrations/eventSources/webhook/runtime.ts";

patchConsoleGlobal();

const glue = {
  gmail: {
    onMessage,
  },
  webhook: {
    onWebhook,
  },
};
export default glue;

interface TriggerEventResponse {
  logs: Log[];
}

interface RegisteredEvent {
  fn: (event: unknown) => void | Promise<void>;
  options: unknown;
}

const eventListenersByType = new Map<string, Map<string, RegisteredEvent>>();

export interface CommonTriggerOptions {
  label?: string;
}

let nextAutomaticLabel = 0;

export function registerEvent<T>(eventName: string, callback: (event: T) => void, eventSchema: z.ZodType<T>, options: CommonTriggerOptions = {}) {
  scheduleInit();

  let specificEventListeners = eventListenersByType.get(eventName);
  if (!specificEventListeners) {
    specificEventListeners = new Map();
    eventListenersByType.set(eventName, specificEventListeners);
  }
  const { label, ...restOptions } = options;
  const resolvedLabel = label ?? String(nextAutomaticLabel++);
  if (specificEventListeners.has(resolvedLabel)) {
    throw new Error(
      `Event listener with label ${JSON.stringify(label)} already registered`,
    );
  }
  specificEventListeners.set(resolvedLabel, { fn: (event: unknown) => callback(eventSchema.parse(event)), options: restOptions });
}

export function getRegisteredTriggers(): RegisteredTrigger[] {
  return Array.from(
    eventListenersByType.entries()
      .flatMap(([type, listeners]) => listeners.keys().map((label) => ({ type, label }))),
  );
}

async function handleTrigger(event: TriggerEvent) {
  const specificEventListeners = eventListenersByType.get(event.type);
  const eventListener = specificEventListeners?.get(event.label);
  if (!eventListener) {
    throw new Error(`Unknown trigger: ${event.type} ${event.label}`);
  }
  await eventListener.fn(event.data);
}

let hasScheduledInit = false;
let hasInited = false;

/**
 * This function needs to be called when any triggers are registered. It
 * schedules a microtask to initialize listening for the triggers, and throws an
 * error if that initialization has already happened.
 */
function scheduleInit() {
  if (hasInited) {
    throw new Error(
      "Attempted to register a trigger after initialization. All triggers must be registered at the top level, see: https://docs.glue.wtf/triggers#TODO",
    );
  }
  if (hasScheduledInit) {
    return;
  }
  hasScheduledInit = true;

  Promise.resolve().then(() => {
    hasInited = true;

    const GLUE_DEV_PORT = Deno.env.get("GLUE_DEV_PORT");

    const serveOptions: Deno.ServeTcpOptions = GLUE_DEV_PORT ? { hostname: "127.0.0.1", port: Number(GLUE_DEV_PORT) } : {};
    serveOptions.onListen = () => {};

    const app = new Hono();
    app.get("/__glue__/getRegisteredTriggers", (c) => {
      return c.json(getRegisteredTriggers());
    });
    app.post("/__glue__/triggerEvent", async (c) => {
      const body = TriggerEvent.parse(await c.req.json());
      const { logs } = await runInLoggingContext(() => handleTrigger(body));
      const response: TriggerEventResponse = { logs };
      return c.json(response);
    });

    Deno.serve(serveOptions, app.fetch);
  });
}
