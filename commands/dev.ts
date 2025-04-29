import { z } from "zod";
import { createDeployment, createGlue, getGlueByName, stopGlue, streamChangesToDeployment as streamChangesTillDeploymentReady } from "../backend.ts";
import { retry } from "@std/async/retry";
import { basename } from "@std/path";
import type { DeploymentDTO, GlueDTO } from "../backend.ts";
import type { DevUIProps } from "../ui/dev.tsx";
import { DevUI } from "../ui/dev.tsx";
import React from "react";
import { type Instance, render } from "ink";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { cyan } from "@std/fmt/colors";
import { debounceAsyncIterable } from "../lib/debounceAsyncIterable.ts";
import { type RegisteredTrigger, TriggerEvent } from "@streak-glue/runtime/internalTypes";
import type { Awaitable } from "../common.ts";
import { equal } from "@std/assert/equal";
import { delay } from "@std/async/delay";

const GLUE_DEV_PORT = 8567; // TODO pick a random unused port or maybe use a unix socket
let devProgressProps: DevUIProps = defaultDevUIProps();
let inkInstance: Instance | undefined;
let lastTriggerEvent: TriggerEvent | undefined;

// ------------------------------------------------------------------------------------------------
// Dev command
// ------------------------------------------------------------------------------------------------
export async function dev(options: DevOptions, filename: string) {
  await checkForAuthCredsOtherwiseExit();

  const glueName = options.name ?? glueNameFromFilename(filename);
  const env = getEnv(glueName);

  let fileChangeWatcher: Deno.FsWatcher | undefined = Deno.watchFs(filename);
  Deno.addSignalListener("SIGINT", () => {
    fileChangeWatcher?.close();
    fileChangeWatcher = undefined; // TODO why is the sigint handler called twice?
  });

  const codeAnalysisResult = await runUIStep("codeAnalysis", () => analyzeCode(filename));
  if (codeAnalysisResult.errors.length > 0) {
    throw new Error("Code analysis failed: " + codeAnalysisResult.errors.join("\n"));
  }

  let localRunner = await runUIStep("bootingCode", async () => await spawnLocalDenoRunnerAndWaitForReady(filename, env));
  const registeredTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());
  let { glue, deployment } = await runUIStep("registeringGlue", async () => await createDeploymentAndMaybeGlue(glueName, registeredTriggers));

  await monitorDeploymentAndRenderChangesTillReady(deployment.id);

  await runUIStep(
    "connectingToTunnel",
    () => connectToDevEventsWebsocketAndHandleTriggerEvents(glue.devEventsWebsocketUrl!, async (message) => await deliverTriggerEvent(deployment, message)),
  );

  await unmountUI();

  const buffer = new Uint8Array(1);
  console.log("Waiting for events (or press 'r' to replay last event)...");

  const keyPressDetectionLoop = async () => {
    while (true) {
      try {
        const n = await Deno.stdin.read(buffer);
        if (n === null) {
          console.log("EOF detected, continuing to listen for events...");
          continue; // Continue listening instead of breaking
        }
        const key = String.fromCharCode(buffer[0]);
        if (key === "r") {
          await replayLastEvent(deployment);
        }
      } catch (e) {
        if (!(e instanceof Deno.errors.Interrupted)) {
          throw e;
        }
      }
    }
  };

  keyPressDetectionLoop().catch((e) => {
    console.error("Error in key press detection loop:", e);
  });

  for await (const events of debounceAsyncIterable(fileChangeWatcher, 200)) {
    if (events.every((e) => e.kind !== "modify")) {
      continue;
    }

    devProgressProps = defaultRestartingUIProps();
    renderUI();
    localRunner.child.kill();

    localRunner = await runUIStep("bootingCode", async () => await spawnLocalDenoRunnerAndWaitForReady(filename, env));
    const newTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());

    if (!equal(registeredTriggers, newTriggers)) {
      devProgressProps.steps.registeringGlue = {
        state: "in_progress",
        duration: 0,
      };
      renderUI();
      deployment = await runUIStep("registeringGlue", async () => await createDeployment(glue.id, { optimisticTriggers: newTriggers }));
      devProgressProps.deployment = deployment;
      await monitorDeploymentAndRenderChangesTillReady(deployment.id);
    }
    await unmountUI();
  }

  await shutdownGlue(glue.id);
  localRunner.child.kill();
  await localRunner.endPromise;
}

// ------------------------------------------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------------------------------------------

async function deliverTriggerEvent(deployment: DeploymentDTO, message: ServerWebsocketMessage) {
  const trigger = deployment.triggers.find((t) => t.label === message.event.label && t.type === message.event.type);
  console.log(cyan(`\n[${new Date().toISOString()}] ${trigger?.type.toUpperCase()} ${trigger?.description}`));
  lastTriggerEvent = message.event;
  await fetch(`http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/triggerEvent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.event satisfies TriggerEvent),
  });
}

async function replayLastEvent(deployment: DeploymentDTO) {
  if (!lastTriggerEvent) {
    return; // No event to replay
  }
  const trigger = deployment.triggers.find((t) => t.label === lastTriggerEvent.label && t.type === lastTriggerEvent.type);
  console.log(cyan(`\n[${new Date().toISOString()}] REPLAYING ${trigger?.type.toUpperCase()} ${trigger?.description}`));
  await fetch(`http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/triggerEvent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lastTriggerEvent satisfies TriggerEvent),
  });
}

async function shutdownGlue(glueId: string) {
  if (glueId) {
    console.log("Stopping glue...");
    await stopGlue(glueId);
  } else {
    console.log("No glue to stop");
  }
}

async function createDeploymentAndMaybeGlue(glueName: string, registeredTriggers: RegisteredTrigger[]): Promise<{ glue: GlueDTO; deployment: DeploymentDTO }> {
  const existingGlue = await getGlueByName(glueName, "dev");
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticTriggers: registeredTriggers }, "dev");
    if (!newGlue.pendingDeployment) {
      throw new Error("No pending deployment");
    }
    return { glue: newGlue, deployment: newGlue.pendingDeployment };
  } else {
    const newDeployment = await createDeployment(existingGlue.id, { optimisticTriggers: registeredTriggers });
    return { glue: existingGlue, deployment: newDeployment };
  }
}

function glueNameFromFilename(filename: string) {
  return basename(filename).replace(/\.[^.]+$/, "");
}

function getEnv(glueName: string) {
  const env: Record<string, string> = {
    GLUE_NAME: glueName,
    GLUE_DEV_PORT: String(GLUE_DEV_PORT),
  };

  const envKeysToKeep = ["LANG", "TZ", "TERM"];
  for (const envKeyToKeep of envKeysToKeep) {
    const value = Deno.env.get(envKeyToKeep);
    if (value) {
      env[envKeyToKeep] = value;
    }
  }
  return env;
}

function analyzeCode(_filename: string): AnalysisResult {
  return { errors: [] };
}

async function discoverTriggers(): Promise<RegisteredTrigger[]> {
  const res = await fetch(
    `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegisteredTriggers`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get registered triggers: ${res.statusText}`);
  }
  const registeredTriggers = await res.json() as RegisteredTrigger[];
  return registeredTriggers;
}

async function spawnLocalDenoRunnerAndWaitForReady(file: string, env: Record<string, string>) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--quiet",
      "--env-file",
      "--no-prompt",
      "--allow-env",
      "--allow-net",
      "--allow-sys", // TODO check if this is supported in deno subhosting
      file,
    ],
    stdin: "null",
    stdout: "inherit",
    clearEnv: true,
    env,
  });

  const child = command.spawn();
  const endPromise = child.status;

  await retry(async () => {
    const res = await fetch(
      `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegisteredTriggers`,
    );
    if (!res.ok) {
      throw new Error(`Failed health check: ${res.statusText}`);
    }
  });

  return { endPromise, child };
}

function connectToDevEventsWebsocketAndHandleTriggerEvents(devEventsWebsocketUrl: string, triggerFn: (message: ServerWebsocketMessage) => Promise<void>) {
  const ws = new WebSocket(devEventsWebsocketUrl);
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
      await triggerFn(message);
    } else {
      console.warn("Unknown websocket message:", message);
    }
  });
  ws.addEventListener("error", (_event) => {
    // console.error("Websocket error:", event);
    // TODO reconnect or throw error?
  });
  ws.addEventListener("close", (_event) => {
    // console.log("Websocket closed:", event);
    // TODO reconnect
  });
}

const ServerWebsocketMessage = z.object({
  type: z.literal("trigger"),
  event: TriggerEvent,
});
type ServerWebsocketMessage = z.infer<typeof ServerWebsocketMessage>;

interface DevOptions {
  name?: string;
}

interface AnalysisResult {
  errors: string[];
}

function defaultDevUIProps(): DevUIProps {
  return {
    steps: {
      codeAnalysis: {
        state: "not_started",
        duration: 0,
      },
      bootingCode: {
        state: "not_started",
        duration: 0,
      },
      discoveringTriggers: {
        state: "not_started",
        duration: 0,
      },
      registeringGlue: {
        state: "not_started",
        duration: 0,
      },
      connectingToTunnel: {
        state: "not_started",
        duration: 0,
      },
    },
    restarting: false,
    deployment: undefined,
  };
}

function defaultRestartingUIProps(): DevUIProps {
  return {
    steps: {
      bootingCode: {
        state: "not_started",
        duration: 0,
      },
      discoveringTriggers: {
        state: "not_started",
        duration: 0,
      },
      registeringGlue: undefined,
    },
    restarting: true,
    deployment: undefined,
  };
}

function renderUI() {
  if (inkInstance) {
    inkInstance.rerender(React.createElement(DevUI, devProgressProps));
  } else {
    inkInstance = render(React.createElement(DevUI, devProgressProps));
  }
}

async function unmountUI() {
  if (inkInstance) {
    await delay(1);
    inkInstance.unmount();
    inkInstance = undefined;
  }
}

async function runUIStep<R>(stepName: keyof DevUIProps["steps"], fn: () => Awaitable<R>): Promise<R> {
  const step = devProgressProps.steps[stepName];
  if (!step) {
    return await fn();
  }

  const start = performance.now();
  step.duration = 0;
  step.state = "in_progress";
  renderUI();
  let retVal;
  try {
    retVal = await fn();
    step.state = "success";
  } catch (e) {
    step.state = "failure";
    throw e;
  } finally {
    step.duration = performance.now() - start;
    renderUI();
  }
  return retVal;
}

async function monitorDeploymentAndRenderChangesTillReady(deploymentId: string) {
  for await (const d of streamChangesTillDeploymentReady(deploymentId)) {
    devProgressProps.deployment = d;
    renderUI();
  }
}
