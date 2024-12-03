// TODO this will be moved into glue-runtime once things are a little more
// stable.
import { Hono } from "hono";

const registeredWebhooks = new Map<string, (event: unknown) => unknown>();

let nextWebhookLabel = 0;

// Will this need to return the id?
export function onWebhook(fn: (event: unknown) => unknown): void {
  scheduleInit();

  const label = String(nextWebhookLabel++);
  if (registeredWebhooks.has(label)) {
    throw new Error(
      `Webhook label ${JSON.stringify(label)} already registered`,
    );
  }
  registeredWebhooks.set(label, fn);
}

const app = new Hono();

app.get("/__glue__/getRegistrations", (c) => {
  return c.json({
    webhooks: Array.from(registeredWebhooks.keys()).map((label) => ({ label })),
  });
});

app.post("/webhooks/:id", async (c) => {
  const id = c.req.param("id");
  const callback = registeredWebhooks.get(id);
  if (callback == null) {
    return c.text("Invalid webhook id", 404);
  }
  const callbackResult = await callback({});
  return c.text(String(callbackResult));
});

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
          const GLUE_NAME = Deno.env.get("GLUE_NAME")!;
          const res = await fetch(
            `${GLUE_API_SERVER}/dev`,
            {
              method: "POST",
              headers: {
                Authorization: GLUE_AUTHORIZATION_HEADER,
              },
              body: JSON.stringify({
                name: GLUE_NAME,
                webhooks: Array.from(registeredWebhooks.keys()).map((
                  label,
                ) => ({
                  label,
                })),
              }),
            },
          );
          if (!res.ok) {
            throw new Error(`Failed to register webhooks: ${res.statusText}`);
          }
          const data = await res.json();
          const websocketUrl = data.websocketUrl;
          const ws = new WebSocket(websocketUrl);
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

            const wsMessage = JSON.parse(event.data);
            console.log("Websocket message:", wsMessage);
            if (wsMessage.event?.request) {
              app.fetch(
                new Request(
                  wsMessage.event.request.url,
                  wsMessage.event.request,
                ),
              );
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
