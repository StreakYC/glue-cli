// TODO this will be moved into glue-runtime once things are a little more
// stable.
import { z } from "zod";
import { Hono } from "hono";

const GlueDevResponse = z.object({
  devEventsWebsocketUrl: z.string(),
  webhooks: z.array(
    z.object({
      label: z.string(),
      url: z.string(),
    }),
  ),
});
type GlueDevResponse = z.infer<typeof GlueDevResponse>;

const WebhookEvent = z.object({
  method: z.string(),
  urlParams: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  bodyText: z.string().optional(),
});
type WebhookEvent = z.infer<typeof WebhookEvent>;

const TriggerEvent = z.object({
  type: z.literal("webhook"),
  label: z.string(),
  data: WebhookEvent,
});
type TriggerEvent = z.infer<typeof TriggerEvent>;

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

interface RegisteredWebhookTrigger {
  label: string;
}

interface RegisteredTriggers {
  webhooks?: Array<RegisteredWebhookTrigger>;
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

let initPhase: "uninit" | "scheduled" | "initialized" = "uninit";

/**
 * This function needs to be called when any triggers are registered. It
 * schedules a microtask to initialize listening for the triggers, and throws an
 * error if that initialization has already happened.
 */
function scheduleInit() {
  switch (initPhase) {
    case "uninit":
      initPhase = "scheduled";
      Promise.resolve().then(async () => {
        initPhase = "initialized";

        if (Deno.env.get("GLUE_DEV") === "true") {
          // connect websocket
          const GLUE_API_SERVER = Deno.env.get("GLUE_API_SERVER")!;
          const GLUE_AUTHORIZATION_HEADER = Deno.env.get(
            "GLUE_AUTHORIZATION_HEADER",
          )!;
          const glueName = Deno.env.get("GLUE_NAME")!;
          const res = await fetch(
            `${GLUE_API_SERVER}/glues/dev`,
            {
              method: "POST",
              headers: {
                Authorization: GLUE_AUTHORIZATION_HEADER,
              },
              body: JSON.stringify({
                name: glueName,
                state: "active",
                triggers: getRegisteredTriggers(),
              }),
            },
          );
          if (!res.ok) {
            throw new Error(`Failed to register webhooks: ${res.statusText}`);
          }

          const glueDevResponse = GlueDevResponse.parse(await res.json());

          console.log("Registered webhooks:", glueDevResponse.webhooks);

          const ws = new WebSocket(glueDevResponse.devEventsWebsocketUrl);
          ws.addEventListener("open", () => {
            console.log("Websocket connected.");
          });
          ws.addEventListener("message", (event) => {
            if (event.data === "ping") {
              ws.send("pong");
              return;
            } else if (event.data === "pong") {
              return;
            }
            const message = JSON.parse(event.data);
            if (message?.type === "trigger") {
              const wsMessage = TriggerEvent.parse(message.trigger);
              console.log("Websocket trigger:", wsMessage);
              handleTrigger(wsMessage);
            } else {
              console.warn("Unknown websocket message:", message);
            }
          });
          ws.addEventListener("error", (event) => {
            console.error("Websocket error:", event);
            // TODO reconnect or throw error?
          });
          ws.addEventListener("close", (event) => {
            console.log("Websocket closed:", event);
            // TODO reconnect
          });
        } else {
          const app = new Hono();
          app.get("/__glue__/getRegisteredTriggers", (c) => {
            return c.json(getRegisteredTriggers());
          });
          app.post("/__glue__/triggerEvent", async (c) => {
            const body = TriggerEvent.parse(await c.req.json());
            await handleTrigger(body);
            return c.text("Success");
          });
          Deno.serve(app.fetch);
        }
      });
      break;
    case "scheduled":
      break;
    case "initialized":
      throw new Error("Already initialized");
  }
}
