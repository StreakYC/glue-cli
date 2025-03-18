import { z } from "zod";
import { createDeployment, createGlue, getGlueById, getGlueByName, streamChangesToDeployment } from "../backend.ts";
import { retry } from "@std/async/retry";
import { basename } from "@std/path";
import { RegisteredTrigger, TriggerEvent } from "../runtime/common.ts";
import { GlueDTO } from "../backend.ts";
import { DevUI, DevUIProps } from "../ui/dev.tsx";
import React from "react";
import { render } from "ink";

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

  let devProgressProps: DevUIProps = {
    codeAnalysisState: "not_started",
    codeAnalysisDuration: 0,
    bootingCodeState: "not_started",
    bootingCodeDuration: 0,
    creatingTriggersState: "not_started",
    creatingTriggersDuration: 0,
    registeringGlueState: "not_started",
    registeringGlueDuration: 0,
    connectingToTunnelState: "not_started",
    connectingToTunnelDuration: 0,
    deployment: undefined,
  };

  const updateUI = (patch: Partial<DevUIProps>) => {
    devProgressProps = { ...devProgressProps, ...patch };
    render(React.createElement(DevUI, devProgressProps));
  };

  let start = performance.now();
  updateUI({ codeAnalysisState: "in_progress", codeAnalysisDuration: 0 });
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

  const localRunnerEndPromise = spawnLocalDenoRunner(file, options, env).endPromise;

  updateUI({ codeAnalysisState: "success", codeAnalysisDuration: performance.now() - start });

  start = performance.now();
  updateUI({ bootingCodeState: "in_progress", bootingCodeDuration: 0 });
  await waitForLocalRunnerToBeReady(glueDevPort);
  updateUI({ bootingCodeState: "success", bootingCodeDuration: performance.now() - start });

  start = performance.now();
  updateUI({ creatingTriggersState: "in_progress", creatingTriggersDuration: 0 });
  const registeredTriggers = await getRegisteredTriggers(glueDevPort);
  updateUI({ creatingTriggersState: "success", creatingTriggersDuration: performance.now() - start });

  start = performance.now();
  updateUI({ registeringGlueState: "in_progress", registeringGlueDuration: 0 });
  const existingGlue = await getGlueByName(glueName, "dev");
  let newDeploymentId: string;
  let glueId: string;
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, { optimisticTriggers: registeredTriggers }, "dev");
    if (!newGlue.currentDeploymentId) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.currentDeploymentId;
    glueId = newGlue.id;
  } else {
    const newDeployment = await createDeployment(existingGlue.id, { optimisticTriggers: registeredTriggers });
    newDeploymentId = newDeployment.id;
    glueId = existingGlue.id;
  }
  updateUI({ registeringGlueState: "success", registeringGlueDuration: performance.now() - start });

  for await (const deployment of streamChangesToDeployment(newDeploymentId)) {
    updateUI({ deployment });
  }

  start = performance.now();
  updateUI({ connectingToTunnelState: "in_progress", connectingToTunnelDuration: 0 });
  const glue = await getGlueById(glueId);
  if (!glue) {
    throw new Error("Glue not found");
  }

  await runWebsocket(glue, glueDevPort);
  updateUI({ connectingToTunnelState: "success", connectingToTunnelDuration: performance.now() - start });

  await localRunnerEndPromise;
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
      await fetch(`http://127.0.0.1:${glueDevPort}/__glue__/triggerEvent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.event satisfies TriggerEvent),
      });
    } else {
      console.warn("Unknown websocket message:", message);
    }
  });
  // ws.addEventListener("error", (event) => {
  //   // console.error("Websocket error:", event);
  //   // TODO reconnect or throw error?
  // });
  // ws.addEventListener("close", (event) => {
  //   // console.log("Websocket closed:", event);
  //   // TODO reconnect
  // });
}
