// TODO this will be moved into glue-runtime once things are a little more
// stable.
import { Hono } from "hono";
import { RegisteredTriggers, TriggerEvent, WebhookEvent } from "./common.ts";

const registeredWebhooks = new Map<
  string,
  (event: WebhookEvent) => void | Promise<void>
>();

let nextWebhookLabel = 0;

interface OnWebhookOptions {
  label?: string;
}

export function onWebhook(
  fn: (event: WebhookEvent) => void | Promise<void>,
  options: OnWebhookOptions = {},
): void {
  scheduleInit();

  const label = options.label ?? String(nextWebhookLabel++);
  if (registeredWebhooks.has(label)) {
    throw new Error(
      `Webhook label ${JSON.stringify(label)} already registered`,
    );
  }
  registeredWebhooks.set(label, fn);
}

function getRegisteredTriggers(): RegisteredTriggers {
  return {
    webhooks: Array.from(registeredWebhooks.keys()).map((label) => ({ label })),
  };
}

async function handleTrigger(event: TriggerEvent) {
  if (event.type !== "webhook") {
    throw new Error(`Unknown event type: ${event.type}`);
  }
  const callback = registeredWebhooks.get(event.label);
  if (callback == null) {
    throw new Error(`Unknown webhook label: ${event.label}`);
  }
  await callback(event.data);
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

    const serveOptions: Deno.ServeTcpOptions = GLUE_DEV_PORT
      ? { hostname: "127.0.0.1", port: Number(GLUE_DEV_PORT) }
      : {};

    const app = new Hono();
    app.get("/__glue__/getRegisteredTriggers", (c) => {
      return c.json(getRegisteredTriggers());
    });
    app.post("/__glue__/triggerEvent", async (c) => {
      const body = TriggerEvent.parse(await c.req.json());
      await handleTrigger(body);
      return c.text("Success");
    });

    Deno.serve(serveOptions, app.fetch);
  });
}
