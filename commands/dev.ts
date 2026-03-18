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
  sampleTrigger,
  stopGlue,
  streamChangesTillDeploymentReady,
} from "../backend.ts";
import type { DeploymentDTO, ExecutionDTO, GlueDTO, TriggerDTO } from "../backend.ts";
import type { DevUIProps } from "../ui/dev.tsx";
import { DevUI } from "../ui/dev.tsx";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import { HTTPException } from "hono/http-exception";
import { upgradeWebSocket } from "hono/deno";
import React from "react";
import { type Instance, render } from "ink";
import { checkForAuthCredsOtherwiseExit, getAuthToken } from "../auth.ts";
import { cyan } from "@std/fmt/colors";
import {
  type Registrations,
  TriggerEvent,
  type TriggerRegistration,
} from "@streak-glue/runtime/backendTypes";
import { type Awaitable, GLUE_API_SERVER } from "../common.ts";
import { equal } from "@std/assert/equal";
import { delay } from "@std/async/delay";
import { keypress, type KeyPressEvent } from "@cliffy/keypress";
import { toLines } from "@std/streams/unstable-to-lines";
import { pushable, pushableV } from "it-pushable";
import { Select } from "@cliffy/prompt/select";
import { toSortedByTypeThenLabel } from "../ui/utils.ts";

import { getGlueName } from "../lib/glueNaming.ts";
import { once } from "node:events";

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

  /**
   * Functions that need to be called and waited on before we can exit the
   * process. (Used for issuing the stop call on the glue after it's created.)
   */
  const cleanupFns: (() => Promise<void>)[] = [
    () => unmountUI(),
  ];

  /**
   * Used so if the user glue process dies, we can put the error in the abort
   * controller and have this function skip forward to the cleanup and exit
   * logic. Also signals resources like the user glue process and websocket
   * connection to shut down.
   */
  const abortController = new AbortController();
  try {
    let lifelineHasConnected = false;
    const lifelineFirstConnectionDeferred = Promise.withResolvers<void>();
    const lifelineReconnectionEvents = pushableV<void>({ objectMode: true });

    const glueName = await getGlueName(filename, options.name);

    const glueCliWebsocketAddr = await wsListen(() => {
      if (!lifelineHasConnected) {
        lifelineHasConnected = true;
        lifelineFirstConnectionDeferred.resolve();
      } else {
        lifelineReconnectionEvents.push();
      }
    });

    const env = await getEnv(glueName, filename, glueCliWebsocketAddr);
    let debugMode: DebugMode = options.inspectWait
      ? "inspect-wait"
      : (options.debug ? "inspect" : "no-debug");
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
      const c = spawnLocalGlueProcess(filename, env, debugMode, abortController);

      const unsub = new AbortController();
      try {
        await Promise.race([
          lifelineFirstConnectionDeferred.promise,
          once(abortController.signal, "abort", { signal: unsub.signal }),
        ]);
      } finally {
        unsub.abort();
      }
      abortController.signal.throwIfAborted();

      return c;
    });
    let registrations = await runUIStep(
      "discoveringTriggers",
      () => discoverRegistrations(abortController.signal),
    );

    let setupReplayResult = options.replay
      ? await runUIStep(
        "gettingExecutionToReplay",
        () => setupReplay(options.replay!, registrations.triggers, abortController.signal),
      )
      : undefined;
    devProgressProps.setupReplayResult = setupReplayResult;

    let { glue, deployment } = await runUIStep(
      "registeringGlue",
      async () =>
        await createDeploymentAndMaybeGlue(glueName, registrations, abortController.signal),
    );
    cleanupFns.push(async () => await shutdownGlue(glue.id, abortController.signal));

    await monitorDeploymentAndRenderChangesTillReady(deployment.id, abortController.signal);
    if (devProgressProps.deployment?.status !== "success") {
      // we've already rendered the failed deployment UI, so we just need to exit here
      renderUI();
      glueProcess.kill();
      Deno.exit(1);
    }

    await runUIStep(
      "connectingToTunnel",
      () =>
        connectToDevEventsWebsocketAndHandleTriggerEvents(
          glue.devEventsWebsocketUrl!,
          async (message) => await deliverTriggerEvent(deployment, message),
          abortController.signal,
        ),
    );
    await unmountUI();

    // Setup is done, now prepare to enter main loop where we wait for incoming
    // events and keypresses.

    abortController.signal.throwIfAborted();

    const abortPushable = pushable<never>({ objectMode: true });
    abortController.signal.addEventListener("abort", () => {
      abortPushable.throw(abortController.signal.reason);
    }, { once: true });

    const mux = new MuxAsyncIterator<KeyPressEvent | void[]>();
    mux.add(abortPushable);
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
        } else if (
          keyPressEvent.key === "e" && setupReplayResult && setupReplayResult.compatible &&
          setupReplayResult.execution
        ) {
          const triggerEvent: TriggerEvent = {
            type: setupReplayResult.execution.trigger.type,
            label: setupReplayResult.execution.trigger.label,
            data: setupReplayResult.execution.inputData,
          };
          const message: ServerWebsocketMessage = { type: "trigger", event: triggerEvent };
          await deliverTriggerEvent(deployment, message, true);
        } else if (keyPressEvent.key === "s") {
          const samplableTriggers = toSortedByTypeThenLabel(deployment.triggers
            .filter((t) => t.supportsSampleEvents));
          if (samplableTriggers.length === 0) {
            console.log("None of your triggers support sample events");
            continue;
          }
          const trigger = await Select.prompt({
            message: "Choose a trigger to sample:",
            options: samplableTriggers.map((t) => ({
              name: `${t.type}(${t.label}) ${t.description}`,
              value: t,
            })),
          });
          console.log(
            "Generating a sample event for:",
            `${trigger.type}(${trigger.label}) ${trigger.description}`,
          );
          await sampleTrigger(trigger.id);
        }

        continue;
      }

      // handle restart events (user glue process restarted because of file
      // edits and we know because it reconnected to the lifeline).

      devProgressProps = defaultRestartingUIProps();
      devProgressProps.debugMode = debugMode;
      if (options.replay) {
        devProgressProps.steps.gettingExecutionToReplay = {
          state: `not_started`,
          duration: 0,
        };
      }

      renderUI();

      const newRegistrations = await runUIStep(
        "discoveringTriggers",
        () => discoverRegistrations(abortController.signal),
      );
      setupReplayResult = options.replay
        ? await runUIStep(
          "gettingExecutionToReplay",
          () => setupReplay(options.replay!, newRegistrations.triggers, abortController.signal),
        )
        : undefined;

      devProgressProps.setupReplayResult = setupReplayResult;
      renderUI();

      if (!equal(registrations, newRegistrations)) {
        registrations = newRegistrations;

        devProgressProps.steps.registeringGlue = {
          state: "in_progress",
          duration: 0,
        };
        renderUI();
        deployment = await runUIStep(
          "registeringGlue",
          async () =>
            await createDeployment(
              glue.id,
              { optimisticRegistrations: registrations },
              abortController.signal,
            ),
        );
        devProgressProps.deployment = deployment;
        await monitorDeploymentAndRenderChangesTillReady(deployment.id, abortController.signal);
        if (devProgressProps.deployment?.status !== "success") {
          // we've already rendered the failed deployment UI, so we just need to exit here
          renderUI();
          glueProcess.kill();
          Deno.exit(1);
        }
      }
      await unmountUI();
    }
    // loop ended, time to exit.

    // Kill everything still listening to the abort signal (websocket and user
    // glue process).
    abortController.abort(new Error("Glue dev process exited by user"));
  } catch (e) {
    // Signal to all abort signal listeners we've errored.
    abortController.abort(e);
    console.error(e);
    await Promise.all(cleanupFns.map((fn) => fn()));
    Deno.exit(1);
  }

  await Promise.all(cleanupFns.map((fn) => fn()));
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
      if (
        reqTokenBuffer.length !== tokenBuffer.length ||
        !timingSafeEqual(reqTokenBuffer, tokenBuffer)
      ) {
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
async function setupReplay(
  executionId: string,
  triggersToCheckCompatibilityWith: TriggerRegistration[],
  signal?: AbortSignal,
): Promise<SetupReplayResult> {
  signal?.throwIfAborted();

  const execution = await getExecutionByIdNoThrow(executionId, signal);
  if (!execution) {
    return { executionId, execution: undefined, compatible: false };
  }
  if (!isTriggerCompatible(execution.trigger, triggersToCheckCompatibilityWith)) {
    return { executionId, execution, compatible: false };
  }
  return { executionId, execution, compatible: true };
}

function isTriggerCompatible(
  trigger: TriggerDTO,
  triggersToCheckCompatibilityWith: TriggerRegistration[],
) {
  return triggersToCheckCompatibilityWith.some((t) =>
    t.label === trigger.label && t.type === trigger.type
  );
}

async function deliverTriggerEvent(
  deployment: DeploymentDTO,
  message: ServerWebsocketMessage,
  isReplay: boolean = false,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();

  const trigger = deployment.triggers.find((t) =>
    t.label === message.event.label && t.type === message.event.type
  );
  const prefix = isReplay ? "REPLAYING " : "";
  console.log(
    cyan(
      `\n[${
        new Date().toISOString()
      }] ${prefix}: ${trigger?.type.toUpperCase()} ${trigger?.description}`,
    ),
  );
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
    signal,
  });
  if (!isReplay) {
    lastMessage = message;
  }
}

async function shutdownGlue(glueId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (glueId) {
    console.log("Stopping glue...");
    await stopGlue(glueId, signal);
  } else {
    console.log("No glue to stop");
  }
}

async function createDeploymentAndMaybeGlue(
  glueName: string,
  registrations: Registrations,
  signal?: AbortSignal,
): Promise<{ glue: GlueDTO; deployment: DeploymentDTO }> {
  const existingGlue = await getGlueByName(glueName, "dev", signal);
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticRegistrations: registrations }, "dev", {
      signal,
    });
    if (!newGlue.pendingDeployment) {
      throw new Error("No pending deployment");
    }
    return { glue: newGlue, deployment: newGlue.pendingDeployment };
  } else {
    const newDeployment = await createDeployment(existingGlue.id, {
      optimisticRegistrations: registrations,
    }, signal);
    return { glue: existingGlue, deployment: newDeployment };
  }
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

async function discoverRegistrations(signal?: AbortSignal): Promise<Registrations> {
  signal?.throwIfAborted();
  const res = await fetch(
    `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegistrations`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Failed to get registrations: ${res.statusText}`);
  }
  const registrations = await res.json() as Registrations;
  return registrations;
}

export type DebugMode = "inspect" | "inspect-wait" | "no-debug";

function spawnLocalGlueProcess(
  file: string,
  env: Record<string, string>,
  debugMode: DebugMode,
  abortController: AbortController,
) {
  abortController.signal.throwIfAborted();

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

  function cleanup() {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }

  abortController.signal.addEventListener("abort", cleanup, { once: true });

  child.status.then((status) => {
    abortController.signal.removeEventListener("abort", cleanup);
    abortController.abort(new Error(`User glue process exited with code ${status.code}`));
  });

  // TODO check for "Watcher Process failed. Restarting on file change..."
  // message and fire the abortController in that case. Maybe only if the
  // initial lifeline connection hasn't been established yet, so we only treat
  // errors on the initial startup as fatal.
  (async () => {
    for await (const line of toLines(child.stdout)) {
      console.log(line);
    }
  })();

  (async () => {
    let isFirstLine = true;
    for await (const line of toLines(child.stderr)) {
      console.error(line);

      // The user glue process run's in deno's --watch mode, so errors aren't
      // fatal and it patiently waits for user to edit the code. However, it's a
      // bit confusing if an error happens on the first start because glue dev
      // is waiting on it. Detect this and abort early.
      if (isFirstLine) {
        if (/^error:/i.test(stripVTControlCharacters(line))) {
          abortController.abort(new Error("User glue process failed to start due to error"));
        }
        isFirstLine = false;
      }
    }
  })();

  return child;
}

function connectToDevEventsWebsocketAndHandleTriggerEvents(
  devEventsWebsocketUrl: string,
  triggerFn: (message: ServerWebsocketMessage) => Promise<void>,
  abortSignal: AbortSignal,
): WebSocket {
  abortSignal.throwIfAborted();

  const ws = new WebSocket(devEventsWebsocketUrl);

  abortSignal.addEventListener("abort", () => {
    ws.close();
  }, { once: true });

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

async function runUIStep<R>(
  stepName: keyof DevUIProps["steps"],
  fn: () => Awaitable<R>,
): Promise<R> {
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

async function monitorDeploymentAndRenderChangesTillReady(
  deploymentId: string,
  signal?: AbortSignal,
) {
  for await (const d of streamChangesTillDeploymentReady(deploymentId, signal)) {
    devProgressProps.deployment = d;
    renderUI();
  }
}
