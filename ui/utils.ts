import { Spinner } from "@std/cli/unstable-spinner";
import * as mod from "@std/fmt/colors";
import type { BuildStepDTO, DeploymentStatus } from "../backend.ts";

export async function runStep<T>(
  message: string,
  fn: () => T,
  logError = true,
  quiet = false,
): Promise<T> {
  if (quiet) {
    return await fn();
  }
  const spinner = Deno.env.get("TERM")?.includes("xterm") ? new Spinner({ message }) : new DummySpinner(message);
  spinner.start();
  let result: T;
  try {
    const start = performance.now();
    result = await fn();
    const end = performance.now();
    spinner.stop();
    console.log(
      mod.green("✔︎") + " " + message +
        mod.gray(` (${Math.round(end - start)}ms)`),
    );
  } catch (e) {
    spinner.stop();
    console.log(
      mod.red("✘") + " " + message + (logError ? ": " + String(e) : ""),
    );
    throw e;
  }
  return result;
}

class DummySpinner {
  constructor(message: string) {
    console.log(message);
  }
  start() {}
  stop() {}
}

export function formatEpochMillis(ms: number | null | undefined) {
  if (!ms) {
    return "-";
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return Temporal.Instant
    .fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(timeZone)
    .toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
}

export function formatBuildSteps(steps: BuildStepDTO[]) {
  return steps.map((step) => {
    return `${convertBuildStepStatusToEmoji(step.status)} ${step.title}`;
  }).join("\n") + "\n";
}

export function formatDeploymentStatus(status: DeploymentStatus, isRunning: boolean) {
  if (isRunning) {
    return mod.green("RUNNING");
  }
  switch (status) {
    case "pending":
      return mod.yellow("pending");
    case "success":
      return mod.cyan("success");
    case "failure":
      return mod.red("failure");
    case "cancelled":
      return mod.gray("cancelled");
  }
}

function convertBuildStepStatusToEmoji(status: string) {
  switch (status) {
    case "success":
      return mod.green("◉");
    case "failure":
      return mod.red("◉");
    case "in_progress":
      return mod.yellow("◕");
    case "not_started":
      return mod.gray("○");
    case "skipped":
      return mod.gray("⊙");
  }
}
