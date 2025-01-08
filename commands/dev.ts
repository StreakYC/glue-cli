import { z } from "zod";
import { retry } from "@std/async/retry";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { GLUE_API_SERVER } from "../common.ts";
import { RegisteredTriggers, TriggerEvent } from "../runtime/common.ts";
import { getLoggedInUser } from "../auth.ts";

/** taken from glue-backend */
interface GlueDTO {
  id: string; // string hex representation of the int64 in the db for easy display
  name: string;
  environment: string;
  user_id: string;
  version: number;
  description: string | null;
  created_at: number; // milliseconds since epoch
  updated_at: number; // milliseconds since epoch
  creator: unknown;
  triggers: object[];
  state: string;
  dev_events_websocket_url?: string;
}

const ServerWebsocketMessage = z.object({
  type: z.literal("trigger"),
  event: TriggerEvent,
});
type ServerWebsocketMessage = z.infer<typeof ServerWebsocketMessage>;

interface DevOptions {
  name?: string;
  allowStdin?: true;
  keepFullEnv?: true;
}

export async function dev(options: DevOptions, file: string) {
  const glueName = options.name ?? basename(file);

  const glueDevPort = 8567; // TODO pick a random unused port or maybe use a unix socket

  const userEmail = await getLoggedInUser();
  const authHeader = "Basic " + encodeBase64(userEmail + ":");
  const existingGlue = await getExistingGlue(authHeader, glueName);

  const env: Record<string, string> = {
    GLUE_NAME: glueName,
    GLUE_DEV_PORT: String(glueDevPort),
  };

  if (!options.keepFullEnv) {
    const envKeysToKeep = ["LANG", "TZ", "TERM"];
    for (const envKeyToKeep of envKeysToKeep) {
      const value = Deno.env.get(envKeyToKeep);
      if (value) {
        env[envKeyToKeep] = value;
      }
    }
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--watch",
      "--env-file",
      "--no-prompt",
      "--allow-env",
      "--allow-net",
      file,
    ],
    stdin: options.allowStdin ? "inherit" : "null",
    stdout: "inherit",
    clearEnv: !options.keepFullEnv,
    env,
  });

  const child = command.spawn();
  const endPromise = child.status.then((status) => {
    Deno.exit(status.code);
  });

  await runWebsocket(authHeader, glueName, existingGlueId, glueDevPort);

  await endPromise;
}

async function getExistingGlue(
  authHeader: string,
  glueName: string,
): Promise<GlueDTO | undefined> {
  const allGluesResponse = await fetch(
    `${GLUE_API_SERVER}/glues?name=${glueName}`,
    {
      headers: { Authorization: authHeader },
    },
  );
  if (!allGluesResponse.ok) {
    throw new Error(
      `Failed to fetch all glues: ${allGluesResponse.statusText}`,
    );
  }
  const allGlues = (await allGluesResponse.json()) as GlueDTO[];
  const existingGlue = allGlues.find(
    (glue) => glue.name === glueName && glue.environment === "dev",
  );
  return existingGlue?.id;
}

async function runWebsocket(
  authHeader: string,
  glueName: string,
  existingGlueId: string | undefined,
  glueDevPort: number,
) {
  // the child process might not be ready yet so we might need to retry this request
  const registeredTriggers = retry(async () => {
    const res = await fetch(
      `http://127.0.0.1:${glueDevPort}/__glue__/getRegisteredTriggers`,
    );
    if (!res.ok) {
      throw new Error(`Failed to get registered triggers: ${res.statusText}`);
    }
    return res.json() as Promise<RegisteredTriggers>;
  });

  let res: Response;
  if (existingGlueId == null) {
    res = await fetch(`${GLUE_API_SERVER}/glues`, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: JSON.stringify({
        name: glueName,
        environment: "dev",
        triggers: registeredTriggers,
      }),
    });
  } else {
    res = await fetch(`${GLUE_API_SERVER}/glues/${existingGlueId}`, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: JSON.stringify({
        name: glueName,
        environment: "dev",
        triggers: registeredTriggers,
      }),
    });
  }
  if (!res.ok) {
    throw new Error(`Failed to register webhooks: ${res.statusText}`);
  }

  const glueDevResponse = await res.json() as GlueDTO;

  // TODO
  // console.log("Registered webhooks:", glueDevResponse.webhooks);

  if (glueDevResponse.dev_events_websocket_url == null) {
    throw new Error("No dev events websocket URL found");
  }

  const ws = new WebSocket(glueDevResponse.dev_events_websocket_url);
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
    const message = ServerWebsocketMessage.parse(JSON.parse(event.data));
    if (message.type === "trigger") {
      fetch(`http://127.0.0.1:${glueDevPort}/__glue__/triggerEvent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.event satisfies TriggerEvent),
      });
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
}
