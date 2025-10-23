import * as path from "@std/path";
import { load as dotenvLoad } from "@std/dotenv";
import { MuxAsyncIterator } from "@std/async/mux-async-iterator";
import { getAvailablePort } from "@std/net";
import { z } from "zod";
import { createDeployment, createGlue, getExecutionByIdNoThrow, getGlueByName, stopGlue, streamChangesTillDeploymentReady } from "../backend.ts";
import { basename } from "@std/path";
import type { DeploymentDTO, ExecutionDTO, GlueDTO, TriggerDTO } from "../backend.ts";
import type { DevUIProps } from "../ui/dev.tsx";
import { DevUI } from "../ui/dev.tsx";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { upgradeWebSocket } from "hono/deno";
import React from "react";
import { type Instance, render } from "ink";
import { checkForAuthCredsOtherwiseExit, getAuthToken } from "../auth.ts";
import { cyan } from "@std/fmt/colors";
import { type Registrations, TriggerEvent, type TriggerRegistration } from "@streak-glue/runtime/backendTypes";
import { type Awaitable, GLUE_API_SERVER } from "../common.ts";
import { equal } from "@std/assert/equal";
import { delay } from "@std/async/delay";
import { keypress, type KeyPressEvent } from "@cliffy/keypress";
import { toLines } from "@std/streams/unstable-to-lines";
import { pushableV } from "it-pushable";

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

  let lifelineHasConnected = false;
  const lifelineFirstConnectionDeferred = Promise.withResolvers<void>();
  const lifelineReconnectionEvents = pushableV<void>({ objectMode: true });

  const glueName = options.name ?? glueNameFromFilename(filename);
  const glueCliWebsocketAddr = await wsListen(() => {
    if (!lifelineHasConnected) {
      lifelineHasConnected = true;
      lifelineFirstConnectionDeferred.resolve();
    } else {
      lifelineReconnectionEvents.push();
    }
  });

  const env = await getEnv(glueName, filename, glueCliWebsocketAddr);
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

  const keypressWatcher = keypress();

  const codeAnalysisResult = await runUIStep("codeAnalysis", () => analyzeCode(filename));
  if (codeAnalysisResult.errors.length > 0) {
    throw new Error("Code analysis failed: " + codeAnalysisResult.errors.join("\n"));
  }

  const glueProcess = await runUIStep("bootingCode", async () => {
    const c = spawnLocalGlueProcess(filename, env, debugMode);
    await lifelineFirstConnectionDeferred.promise;
    return c;
  });
  let registrations = await runUIStep("discoveringTriggers", () => discoverRegistrations());

  let setupReplayResult = options.replay ? await runUIStep("gettingExecutionToReplay", () => setupReplay(options.replay!, registrations.triggers)) : undefined;
  devProgressProps.setupReplayResult = setupReplayResult;

  let { glue, deployment } = await runUIStep("registeringGlue", async () => await createDeploymentAndMaybeGlue(glueName, registrations));

  await monitorDeploymentAndRenderChangesTillReady(deployment.id);
  if (devProgressProps.deployment?.status !== "success") {
    // we've already rendered the failed deployment UI, so we just need to exit here
    renderUI();
    glueProcess.kill();
    Deno.exit(1);
  }

  const ws = await runUIStep(
    "connectingToTunnel",
    () => connectToDevEventsWebsocketAndHandleTriggerEvents(glue.devEventsWebsocketUrl!, async (message) => await deliverTriggerEvent(deployment, message)),
  );
  await unmountUI();

  const mux = new MuxAsyncIterator<KeyPressEvent | void[]>();
  mux.add(lifelineReconnectionEvents);
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
    // handle restart events

    devProgressProps = defaultRestartingUIProps();
    devProgressProps.debugMode = debugMode;
    if (options.replay) {
      devProgressProps.steps.gettingExecutionToReplay = {
        state: `not_started`,
        duration: 0,
      };
    }

    renderUI();

    const newRegistrations = await runUIStep("discoveringTriggers", () => discoverRegistrations());
    setupReplayResult = options.replay ? await runUIStep("gettingExecutionToReplay", () => setupReplay(options.replay!, newRegistrations.triggers)) : undefined;

    devProgressProps.setupReplayResult = setupReplayResult;
    renderUI();

    if (!equal(registrations, newRegistrations)) {
      registrations = newRegistrations;

      devProgressProps.steps.registeringGlue = {
        state: "in_progress",
        duration: 0,
      };
      renderUI();
      deployment = await runUIStep("registeringGlue", async () => await createDeployment(glue.id, { optimisticRegistrations: registrations }));
      devProgressProps.deployment = deployment;
      await monitorDeploymentAndRenderChangesTillReady(deployment.id);
      if (devProgressProps.deployment?.status !== "success") {
        // we've already rendered the failed deployment UI, so we just need to exit here
        renderUI();
        glueProcess.kill();
        Deno.exit(1);
      }
    }
    await unmountUI();
  }
  // loop ended, time to exit

  ws.close();
  try {
    glueProcess.kill();
  } catch {
    // ignore
  }
  await shutdownGlue(glue.id);
  Deno.exit(0);
}

// ------------------------------------------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------------------------------------------

/**
 * Listens on a free port on localhost. This is used so the glue subprocess can
 * connect to this process and detect when this process exits. This is also used
 * to detect when the subprocess has (re)started successfully (the Deno
 * `--watch` flag can cause the subprocess to restart itself when the user
 * changes their glue code).
 * @returns websocket URL
 */
async function wsListen(onConnection: () => void): Promise<string> {
  const token = crypto.randomUUID();
  const tokenBuffer = new TextEncoder().encode(token);

  const app = new Hono();
  app.get(
    "/glue-lifeline-ws",
    upgradeWebSocket((c) => {
      const reqToken = c.req.query("token");
      if (!reqToken) {
        throw new HTTPException(400, { message: "Missing token" });
      }
      const reqTokenBuffer = new TextEncoder().encode(reqToken);
      if (reqTokenBuffer.length !== tokenBuffer.length || !timingSafeEqual(reqTokenBuffer, tokenBuffer)) {
        throw new HTTPException(403, { message: "Invalid token" });
      }

      onConnection();

      return {
        // onMessage(event, ws) {
        //   // don't need to handle any messages from the glue process. The only
        //   // communication we care about is that it started a connection to us,
        //   // and the only communication it cares about is when we close the
        //   // connection when our process dies.
        // },
        // onClose() {
        //   // don't need to do anything on disconnects. Disconnects can mean that
        //   // the process died (which we'll know through the process APIs) or
        //   // because the process was running with the `--watch` flag and is
        //   // restarting the script, which we'll react to when it makes a new
        //   // connection.
        // },
      };
    }),
  );
  const port = await new Promise<number>((resolve, _reject) => {
    Deno.serve({
      hostname: "127.0.0.1",
      port: 0,
      onListen(addr) {
        resolve(addr.port);
      },
    }, app.fetch);
  });
  const glueCliWebsocketAddr = `ws://127.0.0.1:${port}/glue-lifeline-ws?token=${token}`;
  return glueCliWebsocketAddr;
}

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
      // TODO instead of giving the full auth token, get a JWT from the backend
      // that is scoped to this deployment and a limited expiration time.
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
  registrations: Registrations,
): Promise<{ glue: GlueDTO; deployment: DeploymentDTO }> {
  const existingGlue = await getGlueByName(glueName, "dev");
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticRegistrations: registrations }, "dev");
    if (!newGlue.pendingDeployment) {
      throw new Error("No pending deployment");
    }
    return { glue: newGlue, deployment: newGlue.pendingDeployment };
  } else {
    const newDeployment = await createDeployment(existingGlue.id, { optimisticRegistrations: registrations });
    return { glue: existingGlue, deployment: newDeployment };
  }
}

function glueNameFromFilename(filename: string) {
  return basename(filename).replace(/\.[^.]+$/, "");
}

async function getEnv(glueName: string, filename: string, glueCliWebsocketAddr: string) {
  const fileDir = path.dirname(filename);
  const envVarsFromDotEnvFile = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  const env: Record<string, string> = {
    GLUE_NAME: glueName,
    GLUE_CLI_WS_ADDR: glueCliWebsocketAddr,
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

async function discoverRegistrations(): Promise<Registrations> {
  const res = await fetch(
    `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegistrations`,
  );
  if (!res.ok) {
    throw new Error(`Failed to get registrations: ${res.statusText}`);
  }
  const registrations = await res.json() as Registrations;
  return registrations;
}

export type DebugMode = "inspect" | "inspect-wait" | "no-debug";

function spawnLocalGlueProcess(file: string, env: Record<string, string>, debugMode: DebugMode) {
  const flags = [
    "--watch",
    "--quiet",
    "--env-file",
    "--no-prompt",
    "--allow-env",
    "--allow-net",
    "--allow-sys",
    "--unstable-kv",
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

  return child;
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
    inkInstance.unmount();
    inkInstance = undefined;
    await delay(1);
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
