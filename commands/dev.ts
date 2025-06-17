import * as path from "@std/path";
import { load as dotenvLoad } from "@std/dotenv";
import { MuxAsyncIterator } from "@std/async/mux-async-iterator";
import { getAvailablePort } from "@std/net";
import { z } from "zod";
import {
  createDeployment,
  createGlue,
  getExecutionByIdNoThrow,
  getGlueByName,
  stopGlue,
  streamChangesToDeployment as streamChangesTillDeploymentReady,
} from "../backend.ts";
import { retry, type RetryOptions } from "@std/async/retry";
import { basename } from "@std/path";
import type { DeploymentDTO, ExecutionDTO, GlueDTO, TriggerDTO } from "../backend.ts";
import type { DevUIProps } from "../ui/dev.tsx";
import { DevUI } from "../ui/dev.tsx";
import React from "react";
import { type Instance, render } from "ink";
import { checkForAuthCredsOtherwiseExit, getAuthToken } from "../auth.ts";
import { cyan } from "@std/fmt/colors";
import { debounceAsyncIterable } from "../lib/debounceAsyncIterable.ts";
import { type Registrations, TriggerEvent, type TriggerRegistration } from "@streak-glue/runtime/internalTypes";
import { type Awaitable, GLUE_API_SERVER } from "../common.ts";
import { equal } from "@std/assert/equal";
import { delay } from "@std/async/delay";
import { keypress, type KeyPressEvent } from "@cliffy/keypress";
import { toLines } from "@std/streams/unstable-to-lines";

const GLUE_DEV_PORT = getAvailablePort({ preferredPort: 8001 });
const DEFAULT_DEBUG_PORT = 9229;
let devProgressProps: DevUIProps = defaultDevUIProps();
let inkInstance: Instance | undefined;
let lastMessage: ServerWebsocketMessage | undefined;

// ------------------------------------------------------------------------------------------------
// Dev command
// ------------------------------------------------------------------------------------------------
export async function dev(options: DevOptions, filename: string) {
  await checkForAuthCredsOtherwiseExit();

  const glueName = options.name ?? glueNameFromFilename(filename);
  const env = await getEnv(glueName, filename);
  let debugMode: DebugMode = options.inspectWait ? "inspect-wait" : (options.debug ? "inspect" : "no-debug");
  if (debugMode !== "no-debug") {
    if (!isPortAvailable(DEFAULT_DEBUG_PORT)) {
      console.warn(`Debugger port ${DEFAULT_DEBUG_PORT} is already in use, disabling debugger.`);
      debugMode = "no-debug";
    }
  }
  devProgressProps.debugMode = debugMode;
  if (options.replay) {
    devProgressProps.steps.gettingExecutionToReplay = {
      state: `not_started`,
      duration: 0,
    };
  }

  // TODO instead of watching the glue file ourselves and restarting the
  // subprocess on changes, we could lean on deno's built-in `--watch` flag to
  // restart the subprocess on changes. This would also fix the issue where we
  // don't restart on changes of imported files. We would need to make the
  // subprocess initiate a connection to the glue-cli process on startup. If we
  // then made the subprocess exit itself when its connection to glue-cli ended,
  // then this would also fully prevent any possibility of orphaned
  // subprocesses.
  const fileChangeWatcher = Deno.watchFs(filename);
  const keypressWatcher = keypress();

  let disposed = false;
  Deno.addSignalListener("SIGINT", () => {
    if (disposed) {
      return;
    }
    disposed = true;
    fileChangeWatcher.close();
    keypressWatcher.dispose();
  });

  const codeAnalysisResult = await runUIStep("codeAnalysis", () => analyzeCode(filename));
  if (codeAnalysisResult.errors.length > 0) {
    throw new Error("Code analysis failed: " + codeAnalysisResult.errors.join("\n"));
  }

  let localRunner = await runUIStep("bootingCode", async () => await spawnLocalDenoRunnerAndWaitForReady(filename, env, debugMode));
  const registeredTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());

  let setupReplayResult = options.replay ? await runUIStep("gettingExecutionToReplay", () => setupReplay(options.replay!, registeredTriggers)) : undefined;
  devProgressProps.setupReplayResult = setupReplayResult;

  let { glue, deployment } = await runUIStep("registeringGlue", async () => await createDeploymentAndMaybeGlue(glueName, registeredTriggers));

  await monitorDeploymentAndRenderChangesTillReady(deployment.id);
  if (devProgressProps.deployment?.status !== "success") {
    // we've already rendered the failed deployment UI, so we just need to exit here
    renderUI();
    localRunner.child.kill();
    Deno.exit(1);
  }

  const ws = await runUIStep(
    "connectingToTunnel",
    () => connectToDevEventsWebsocketAndHandleTriggerEvents(glue.devEventsWebsocketUrl!, async (message) => await deliverTriggerEvent(deployment, message)),
  );
  await unmountUI();

  const mux = new MuxAsyncIterator<Deno.FsEvent[] | KeyPressEvent>();
  mux.add(debounceAsyncIterable(fileChangeWatcher, 200));
  mux.add(keypressWatcher);
  for await (const event of mux) {
    // handle keypress events
    if (!Array.isArray(event)) {
      const keyPressEvent = event as KeyPressEvent;
      if (keyPressEvent.key === "q" || keyPressEvent.key === "Q") {
        break;
      } else if (keyPressEvent.ctrlKey && keyPressEvent.key === "c") {
        break;
      } else if (keyPressEvent.key === "r" && lastMessage) {
        await deliverTriggerEvent(deployment, lastMessage, true);
      } else if (keyPressEvent.key === "e" && setupReplayResult && setupReplayResult.compatible && setupReplayResult.execution) {
        const triggerEvent: TriggerEvent = {
          type: setupReplayResult.execution.trigger.type,
          label: setupReplayResult.execution.trigger.label,
          data: setupReplayResult.execution.inputData,
        };
        const message: ServerWebsocketMessage = { type: "trigger", event: triggerEvent };
        await deliverTriggerEvent(deployment, message, true);
      }
      continue;
    }

    // handle file change events
    const fileChangeEvents = event as Deno.FsEvent[];
    if (fileChangeEvents.every((e) => e.kind !== "modify")) {
      continue;
    }

    devProgressProps = defaultRestartingUIProps();
    devProgressProps.debugMode = debugMode;
    if (options.replay) {
      devProgressProps.steps.gettingExecutionToReplay = {
        state: `not_started`,
        duration: 0,
      };
    }

    renderUI();
    localRunner.child.kill();

    localRunner = await runUIStep("bootingCode", async () => await spawnLocalDenoRunnerAndWaitForReady(filename, env, debugMode));
    const newTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());
    setupReplayResult = options.replay ? await runUIStep("gettingExecutionToReplay", () => setupReplay(options.replay!, newTriggers)) : undefined;

    devProgressProps.setupReplayResult = setupReplayResult;
    renderUI();

    if (!equal(registeredTriggers, newTriggers)) {
      devProgressProps.steps.registeringGlue = {
        state: "in_progress",
        duration: 0,
      };
      renderUI();
      const optimisticRegistrations: Registrations = { triggers: newTriggers, accountInjections: [] };
      deployment = await runUIStep("registeringGlue", async () => await createDeployment(glue.id, { optimisticRegistrations }));
      devProgressProps.deployment = deployment;
      await monitorDeploymentAndRenderChangesTillReady(deployment.id);
      if (devProgressProps.deployment?.status !== "success") {
        // we've already rendered the failed deployment UI, so we just need to exit here
        renderUI();
        localRunner.child.kill();
        Deno.exit(1);
      }
    }
    await unmountUI();
  }

  ws.close();
  try {
    localRunner.child.kill();
  } catch {
    // ignore
  }
  await shutdownGlue(glue.id);
  Deno.exit(0);
}

// ------------------------------------------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------------------------------------------

function isPortAvailable(port: number): boolean {
  try {
    const listener = Deno.listen({ port });
    listener.close();
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.AddrInUse) {
      return false;
    }
    throw error;
  }
}

export interface SetupReplayResult {
  executionId: string;
  execution: ExecutionDTO | undefined;
  compatible: boolean;
}
async function setupReplay(executionId: string, triggersToCheckCompatibilityWith: TriggerRegistration[]): Promise<SetupReplayResult> {
  const execution = await getExecutionByIdNoThrow(executionId);
  if (!execution) {
    return { executionId, execution: undefined, compatible: false };
  }
  if (!isTriggerCompatible(execution.trigger, triggersToCheckCompatibilityWith)) {
    return { executionId, execution, compatible: false };
  }
  return { executionId, execution, compatible: true };
}

function isTriggerCompatible(trigger: TriggerDTO, triggersToCheckCompatibilityWith: TriggerRegistration[]) {
  return triggersToCheckCompatibilityWith.some((t) => t.label === trigger.label && t.type === trigger.type);
}

async function deliverTriggerEvent(deployment: DeploymentDTO, message: ServerWebsocketMessage, isReplay: boolean = false) {
  const trigger = deployment.triggers.find((t) => t.label === message.event.label && t.type === message.event.type);
  const prefix = isReplay ? "REPLAYING " : "";
  console.log(cyan(`\n[${new Date().toISOString()}] ${prefix}: ${trigger?.type.toUpperCase()} ${trigger?.description}`));
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error("No auth token found, please run `glue login` first.");
  }
  await fetch(`http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/triggerEvent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Glue-Deployment-Id": deployment.id,
      "X-Glue-API-Auth-Header": `Bearer ${authToken}`,
    },
    body: JSON.stringify(message.event satisfies TriggerEvent),
  });
  if (!isReplay) {
    lastMessage = message;
  }
}

async function shutdownGlue(glueId: string) {
  if (glueId) {
    console.log("Stopping glue...");
    await stopGlue(glueId);
  } else {
    console.log("No glue to stop");
  }
}

async function createDeploymentAndMaybeGlue(
  glueName: string,
  triggerRegistrations: TriggerRegistration[],
): Promise<{ glue: GlueDTO; deployment: DeploymentDTO }> {
  const optimisticRegistrations: Registrations = { triggers: triggerRegistrations, accountInjections: [] };
  const existingGlue = await getGlueByName(glueName, "dev");
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticRegistrations }, "dev");
    if (!newGlue.pendingDeployment) {
      throw new Error("No pending deployment");
    }
    return { glue: newGlue, deployment: newGlue.pendingDeployment };
  } else {
    const newDeployment = await createDeployment(existingGlue.id, { optimisticRegistrations });
    return { glue: existingGlue, deployment: newDeployment };
  }
}

function glueNameFromFilename(filename: string) {
  return basename(filename).replace(/\.[^.]+$/, "");
}

async function getEnv(glueName: string, filename: string) {
  const fileDir = path.dirname(filename);
  const envVarsFromDotEnvFile = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  const env: Record<string, string> = {
    GLUE_NAME: glueName,
    GLUE_DEV_PORT: String(GLUE_DEV_PORT),
    GLUE_API_SERVER,
    ...envVarsFromDotEnvFile,
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

async function discoverTriggers(): Promise<TriggerRegistration[]> {
  const res = await fetch(
    `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegisteredTriggers`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get registered triggers: ${res.statusText}`);
  }
  const registeredTriggers = await res.json() as TriggerRegistration[];
  return registeredTriggers;
}

export type DebugMode = "inspect" | "inspect-wait" | "no-debug";

async function spawnLocalDenoRunnerAndWaitForReady(file: string, env: Record<string, string>, debugMode: DebugMode) {
  const flags = [
    "--quiet",
    "--env-file",
    "--no-prompt",
    "--allow-env",
    "--allow-net",
    "--allow-sys",
  ];
  if (debugMode !== "no-debug") {
    flags.push("--" + debugMode);
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      ...flags,
      file,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    clearEnv: true,
    env,
  });

  const child = command.spawn();
  const endPromise = child.status;

  (async () => {
    for await (const line of toLines(child.stdout)) {
      console.log(line);
    }
  })();

  (async () => {
    for await (const line of toLines(child.stderr)) {
      console.error(line);
    }
  })();

  // If we're in inspect-wait mode, we need to retry the health check until the debugger is connected.
  // This is a bit of a hack, but it works.
  const retryOpts: RetryOptions | undefined = debugMode === "inspect-wait"
    ? {
      multiplier: 1,
      minTimeout: 1000,
      maxTimeout: 1000,
      maxAttempts: 1000000,
    }
    : undefined;
  await retry(async () => {
    const res = await fetch(
      `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegisteredTriggers`,
    );
    if (!res.ok) {
      throw new Error(`Failed health check: ${res.statusText}`);
    }
  }, retryOpts);

  return { endPromise, child };
}

function connectToDevEventsWebsocketAndHandleTriggerEvents(
  devEventsWebsocketUrl: string,
  triggerFn: (message: ServerWebsocketMessage) => Promise<void>,
): WebSocket {
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
  return ws;
}

const ServerWebsocketMessage = z.object({
  type: z.literal("trigger"),
  event: TriggerEvent,
});
type ServerWebsocketMessage = z.infer<typeof ServerWebsocketMessage>;

interface DevOptions {
  name?: string;
  debug?: boolean;
  inspectWait?: boolean;
  replay?: string;
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
    debugMode: "inspect",
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
    debugMode: "inspect",
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
