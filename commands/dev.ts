import { z } from "zod";
import {
  createDeployment,
  createGlue,
  getGlueById,
  getGlueByName,
  stopGlue,
  streamChangesToDeployment as streamChangesTillDeploymentReady,
} from "../backend.ts";
import { retry } from "@std/async/retry";
import { basename } from "@std/path";
import { type Awaitable, type RegisteredTrigger, TriggerEvent } from "../runtimeCommon.ts";
import type { GlueDTO } from "../backend.ts";
import { DevUI, type DevUIProps } from "../ui/dev.tsx";
import React from "react";
import { render } from "ink";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { cyan } from "@std/fmt/colors";

const GLUE_DEV_PORT = 8567; // TODO pick a random unused port or maybe use a unix socket
const devProgressProps: DevUIProps = defaultDevUIProps();
let inkInstance: { unmount: () => void } | undefined;

// ------------------------------------------------------------------------------------------------
// Dev command
// ------------------------------------------------------------------------------------------------
export async function dev(options: DevOptions, filename: string) {
  await checkForAuthCredsOtherwiseExit();

  const glueName = options.name ?? glueNameFromFilename(filename);
  const env = getEnv(glueName);

  Deno.addSignalListener("SIGINT", async () => await shutdown(glueId));

  const codeAnalysisResult = await runUIStep("codeAnalysis", () => analyzeCode(filename));
  if (codeAnalysisResult.errors.length > 0) {
    throw new Error("Code analysis failed");
  }

  const localRunner = await runUIStep("bootingCode", async () => await spawnLocalDenoRunnerAndWaitForReady(filename, env));
  const registeredTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());
  const { glueId, deployment } = await runUIStep("registeringGlue", async () => await createDeploymentAndMaybeGlue(glueName, registeredTriggers));

  for await (const d of streamChangesTillDeploymentReady(deployment.id)) {
    devProgressProps.deployment = d;
    renderUI(devProgressProps);
  }

  await runUIStep("connectingToTunnel", async () => connectToDevEventsWebsocketAndHandleTriggerEvents(await getGlueOrThrow(glueId)));

  unmountUI();

  await localRunner.endPromise;
}

// ------------------------------------------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------------------------------------------
async function shutdown(glueId: string) {
  if (glueId) {
    console.log("Stopping glue...");
    await stopGlue(glueId);
  } else {
    console.log("No glue to stop");
  }
  Deno.exit();
}

async function getGlueOrThrow(glueId: string) {
  const glue = await getGlueById(glueId);
  if (!glue) {
    throw new Error(`Glue not found: ${glueId}`);
  }
  return glue;
}

async function createDeploymentAndMaybeGlue(glueName: string, registeredTriggers: RegisteredTrigger[]) {
  const existingGlue = await getGlueByName(glueName, "dev");
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticTriggers: registeredTriggers }, "dev");
    if (!newGlue.pendingDeployment) {
      throw new Error("No pending deployment");
    }
    return { glueId: newGlue.id, deployment: newGlue.pendingDeployment };
  } else {
    const newDeployment = await createDeployment(existingGlue.id, { optimisticTriggers: registeredTriggers });
    return { glueId: existingGlue.id, deployment: newDeployment };
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

function connectToDevEventsWebsocketAndHandleTriggerEvents(glue: GlueDTO) {
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
      const trigger = glue.currentDeployment!.triggers.find((t) => t.label === message.event.label && t.type === message.event.type);
      console.log(cyan(`\n[${new Date().toISOString()}] ${trigger?.type.toUpperCase()} ${trigger?.description}`));
      await fetch(`http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/triggerEvent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.event satisfies TriggerEvent),
      });
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
    deployment: undefined,
  };
}

function renderUI(props: DevUIProps) { // TODO no need to take in props, just use the state
  inkInstance = render(React.createElement(DevUI, props));
}
const unmountUI = () => {
  if (inkInstance) {
    inkInstance.unmount();
    inkInstance = undefined;
  }
};
async function runUIStep<R>(stepName: keyof DevUIProps["steps"], fn: () => Awaitable<R>): Promise<R> {
  const start = performance.now();
  devProgressProps.steps[stepName].duration = 0;
  devProgressProps.steps[stepName].state = "in_progress";
  renderUI(devProgressProps);
  let retVal;
  try {
    retVal = await fn();
    devProgressProps.steps[stepName].state = "success";
  } catch (e) {
    devProgressProps.steps[stepName].state = "failure";
    throw e;
  } finally {
    devProgressProps.steps[stepName].duration = performance.now() - start;
    renderUI(devProgressProps);
  }
  return retVal;
}
