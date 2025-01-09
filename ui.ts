import { Spinner } from "@std/cli/unstable-spinner";
import * as mod from "@std/fmt/colors";

export async function runStep<T>(
  message: string,
  fn: () => T,
  logError = true,
): Promise<T> {
  const spinner = Deno.env.get("TERM")?.includes("xterm")
    ? new Spinner({ message })
    : new DummySpinner(message);
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
