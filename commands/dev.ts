import { z } from "zod";
import { createDeployment, createGlue, getGlueById, getGlueByName, stopGlue, streamChangesToDeployment } from "../backend.ts";
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

const devProgressProps: DevUIProps = defaultDevUIProps();
let inkInstance: { unmount: () => void } | undefined;

export async function dev(options: DevOptions, filename: string) {
  await checkForAuthCredsOtherwiseExit();
  
  let glueId: string | undefined;
  let localRunner: { endPromise: Promise<void>; child: Deno.ChildProcess } | undefined;
  let previousTriggers: RegisteredTrigger[] | undefined;
  
  Deno.addSignalListener("SIGINT", async () => {
    if (glueId) {
      console.log("Stopping glue...");
      await stopGlue(glueId);
    } else {
      console.log("No glue to stop");
    }
    Deno.exit();
  });

  const result = await runGlueFile(filename, options);
  glueId = result.glueId;
  localRunner = result.localRunner;
  previousTriggers = result.registeredTriggers;

  const watcher = Deno.watchFs(filename);

  try {
    for await (const event of watcher) {
      if (event.kind === "modify" && event.paths.some(path => path === filename)) {
        console.log(cyan(`\n[${new Date().toISOString()}] File changed, restarting...`));
        
        if (localRunner) {
          localRunner.child.kill("SIGTERM");
          await localRunner.endPromise.catch(() => {}); // Ignore errors from the killed process
        }
        
        const newResult = await runGlueFile(filename, options, glueId, previousTriggers);
        localRunner = newResult.localRunner;
        previousTriggers = newResult.registeredTriggers;
      }
    }
  } catch (error) {
    console.error("File watching error:", error);
  } finally {
    watcher.close();
  }

  if (localRunner) {
    await localRunner.endPromise;
  }
}

interface AnalysisResult {
  glueName: string;
  env: Record<string, string>;
}

function analyzeCode(filename: string, options: DevOptions): AnalysisResult {
  const glueName = options.name ?? basename(filename).replace(/\.[^.]+$/, "");

  const env: Record<string, string> = {
    GLUE_NAME: glueName,
    GLUE_DEV_PORT: String(GLUE_DEV_PORT),
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
  return { glueName, env };
}

async function waitForLocalRunnerToBeReady() {
  await retry(async () => {
    const res = await fetch(
      `http://127.0.0.1:${GLUE_DEV_PORT}/__glue__/getRegisteredTriggers`,
    );
    if (!res.ok) {
      throw new Error(`Failed health check: ${res.statusText}`);
    }
  });
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

function areTriggersEqual(a: RegisteredTrigger[], b: RegisteredTrigger[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const triggerMap = new Map<string, RegisteredTrigger>();
  for (const trigger of a) {
    triggerMap.set(`${trigger.type}:${trigger.label}`, trigger);
  }

  for (const trigger of b) {
    const key = `${trigger.type}:${trigger.label}`;
    if (!triggerMap.has(key)) {
      return false;
    }
  }

  return true;
}

function spawnLocalDenoRunner(file: string, options: DevOptions, env: Record<string, string>) {
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
    stdin: options.allowStdin ? "inherit" : "null",
    stdout: "inherit",
    clearEnv: !options.keepFullEnv,
    env,
  });

  const child = command.spawn();
  const endPromise = child.status.then((status) => {
    if (status.code !== 0 && status.signal !== "SIGTERM") {
      Deno.exit(status.code);
    }
  });
  return { endPromise, child };
}

interface GlueRunResult {
  glueId: string;
  localRunner: { endPromise: Promise<void>; child: Deno.ChildProcess };
  registeredTriggers: RegisteredTrigger[];
}

async function runGlueFile(
  filename: string, 
  options: DevOptions, 
  existingGlueId?: string,
  previousTriggers?: RegisteredTrigger[]
): Promise<GlueRunResult> {
  const result = await runUIStep("codeAnalysis", () => analyzeCode(filename, options));
  const { glueName, env } = result;

  const localRunner = await runUIStep("bootingCode", async () => {
    const r = spawnLocalDenoRunner(filename, options, env);
    await waitForLocalRunnerToBeReady();
    return r;
  });

  const registeredTriggers = await runUIStep("discoveringTriggers", () => discoverTriggers());

  if (existingGlueId && previousTriggers && areTriggersEqual(previousTriggers, registeredTriggers)) {
    console.log(cyan(`\n[${new Date().toISOString()}] No changes in triggers, skipping deployment`));
    
    const glue = await getGlueById(existingGlueId);
    if (!glue) {
      throw new Error("Glue not found");
    }
    
    await runUIStep("connectingToTunnel", () => {
      runWebsocket(glue);
    });
    
    return { glueId: existingGlueId, localRunner, registeredTriggers };
  }

  const { glueId, deployment } = await runUIStep("registeringGlue", async () => {
    if (existingGlueId) {
      const newDeployment = await createDeployment(existingGlueId, { optimisticTriggers: registeredTriggers });
      return { glueId: existingGlueId, deployment: newDeployment };
    } else {
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
  });

  for await (const d of streamChangesToDeployment(deployment.id)) {
    devProgressProps.deployment = d;
    renderUI(devProgressProps);
  }

  await runUIStep("connectingToTunnel", async () => {
    const glue = await getGlueById(glueId);
    if (!glue) {
      throw new Error("Glue not found");
    }
    return runWebsocket(glue);
  });

  return { glueId, localRunner, registeredTriggers };
}

function runWebsocket(glue: GlueDTO) {
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
const _unmountUI = () => {
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
