import { z } from "zod";
import { createDeployment, createGlue, getBuildLogs, getDeploymentById, getGlueById, getGlueByName } from "../backend.ts";
import { retry } from "@std/async/retry";
import { basename } from "@std/path";
import { RegisteredTrigger, TriggerEvent } from "../runtime/common.ts";
import { GlueDTO } from "../backend.ts";
import { runStep } from "../ui.ts";
import * as mod from "@std/fmt/colors";

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
  Deno.addSignalListener("SIGINT", () => {
    Deno.exit();
  });

  const glueName = options.name ?? basename(file).replace(/\.[^.]+$/, "");
  const glueDevPort = 8567; // TODO pick a random unused port or maybe use a unix socket

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

  const existingGlue = await runStep("Checking for an existing glue", () => getGlueByName(glueName, "dev"));

  const localRunnerEndPromise = spawnLocalDenoRunner(file, options, env).endPromise;

  await runStep("Booting up your code", () => waitForLocalRunnerToBeReady(glueDevPort));
  const registeredTriggers = await runStep("Figuring out your triggers", () => getRegisteredTriggers(glueDevPort));
  console.log(`  Found ${registeredTriggers.length} registered triggers`);

  let newDeploymentId: string;
  let glueId: string;
  if (!existingGlue) {
    const newGlue = await runStep("Creating glue", () => createGlue(glueName, registeredTriggers, "dev"));
    if (!newGlue.currentDeploymentId) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.currentDeploymentId;
    glueId = newGlue.id;
  } else {
    const newDeployment = await runStep("Creating new deployment", () => createDeployment(existingGlue.id, registeredTriggers));
    newDeploymentId = newDeployment.id;
    glueId = existingGlue.id;
  }

  await runStep("Watching deployment logs", async () => {
    for await (const buildLog of getBuildLogs(newDeploymentId)) {
      console.log(buildLog);
    }
  });

  const glue = await runStep("Waiting for deployment to be ready", async () => {
    await pollForDeploymentToBeReady(newDeploymentId);
    const glue = await getGlueById(glueId);
    if (!glue) {
      throw new Error("Glue not found");
    }
    return glue;
  });

  await runStep("Setting up tunnel to local runner", () => runWebsocket(glue, glueDevPort));

  const triggersString = glue.currentDeployment?.triggers
    ?.sort((a, b) => a.type.localeCompare(b.type))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((t) => `    ${t.type} ${t.label}: ${t.description}`)
    .join("\n");
  console.log(`  Triggers:\n${triggersString}`);

  await localRunnerEndPromise;
}

async function pollForDeploymentToBeReady(deploymentId: string) {
  await retry(async () => {
    const deployment = await getDeploymentById(deploymentId);
    if (!deployment) {
      throw new Error("Deployment not found");
    }
    if (deployment.isInitializing) {
      throw new Error("Deployment not ready");
    }
  }, {
    multiplier: 1,
    minTimeout: 500,
    maxAttempts: 20,
  });
}

async function waitForLocalRunnerToBeReady(glueDevPort: number) {
  await retry(async () => {
    const res = await fetch(
      `http://127.0.0.1:${glueDevPort}/__glue__/getRegisteredTriggers`,
    );
    if (!res.ok) {
      throw new Error(`Failed health check: ${res.statusText}`);
    }
  });
}

async function getRegisteredTriggers(glueDevPort: number): Promise<RegisteredTrigger[]> {
  const res = await fetch(
    `http://127.0.0.1:${glueDevPort}/__glue__/getRegisteredTriggers`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get registered triggers: ${res.statusText}`);
  }
  const registeredTriggers = await res.json() as RegisteredTrigger[];
  return registeredTriggers;
}

function spawnLocalDenoRunner(file: string, options: DevOptions, env: Record<string, string>) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--quiet",
      // "--watch", // TODO commented out for now because when the user code changes, we need to potentially resetup the triggers
      "--env-file",
      "--no-prompt",
      "--allow-env",
      "--allow-net",
      "--allow-sys", // TODO check if this is supported in deno subhosting
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
  return { endPromise };
}

function runWebsocket(glue: GlueDTO, glueDevPort: number) {
  if (glue.devEventsWebsocketUrl == null) {
    throw new Error("No dev events websocket URL found");
  }

  const ws = new WebSocket(glue.devEventsWebsocketUrl);
  ws.addEventListener("open", () => {
    // console.log("Websocket connected.");
  });
  ws.addEventListener("message", async (event) => {
    if (event.data === "ping") {
      ws.send("pong");
      return;
    } else if (event.data === "pong") {
      return;
    }
    const message = ServerWebsocketMessage.parse(JSON.parse(event.data));
    if (message.type === "trigger") {
      const separator = mod.cyan("----------------------------");
      const triggerStartString = mod.cyan(`Trigger ${message.event.type}(${message.event.label}) received`);
      console.log(`\n${getFormattedDateString()} ${triggerStartString} ${separator}`);
      const start = performance.now();
      await fetch(`http://127.0.0.1:${glueDevPort}/__glue__/triggerEvent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.event satisfies TriggerEvent),
      });
      const elapsed = performance.now() - start;
      const triggerEndString = mod.cyan(`Trigger ${message.event.type}(${message.event.label}) handled`);
      console.log(`${getFormattedDateString()} ${triggerEndString} ${getFormattedElapsedString(elapsed)} ${separator}`);
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

function getFormattedDateString() {
  return mod.dim(`[${new Date().toISOString()}]`);
}

function getFormattedElapsedString(elapsed: number) {
  return mod.dim(`(${Math.round(elapsed * 10) / 10}ms)`);
}
