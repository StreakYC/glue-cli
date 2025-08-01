import { type ExecutionDTO, getExecutions, getGlueByName, type GlueDTO } from "../backend.ts";
import { cyan, dim, green, red } from "@std/fmt/colors";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { delay } from "@std/async/delay";
import { Spinner } from "@std/cli/unstable-spinner";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
interface LogsOptions {
  json?: boolean;
  number: number;
  noFollow?: boolean;
  logLines: number;
  fullLogLines?: boolean;
  filter?: string;
}

export const logs = async (options: LogsOptions, name?: string) => {
  await checkForAuthCredsOtherwiseExit();
  // look for sigint
  Deno.addSignalListener("SIGINT", () => {
    Deno.exit(0);
  });

  let glue: GlueDTO | undefined;

  if (name) {
    glue = await runStep("Loading glue...", () => getGlueByName(name, "deploy"), true, !!options.json);
  } else if (Deno.stdout.isTerminal() && !options.json) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name when not running in a terminal or when in json mode");
  }

  if (!glue) {
    const errorMsg = name ? `Glue ${name} not found` : "No glue found";
    throw new Error(errorMsg);
  }

  const now = new Date();
  const historicalExecutions = await runStep(
    `Loading historical executions for ${glue.name}...`,
    () => getExecutions(glue.id, options.number, now, "desc", !!options.json, options.filter),
    true,
    !!options.json,
  );
  historicalExecutions.reverse();

  if (options.json) {
    historicalExecutions.forEach((e) => {
      console.log(JSON.stringify(e));
    });
    return;
  }

  renderExecutions(historicalExecutions, options.logLines, !!options.fullLogLines);

  let startingPoint = now;
  const pollingSpinner = new Spinner({ message: "Waiting for new executions...", color: "green" });
  while (!options.noFollow) {
    pollingSpinner.start();
    const executions = await getExecutions(glue.id, 10, startingPoint, "asc", false, options.filter);
    if (executions.length > 0) {
      pollingSpinner.stop();
      renderExecutions(executions, options.logLines, !!options.fullLogLines);
      startingPoint = new Date(executions[executions.length - 1].endedAt!);
      pollingSpinner.start();
    }
    await delay(1000);
  }
};

function renderExecutions(executions: ExecutionDTO[], logLines: number, fullLogLines: boolean) {
  executions.forEach((e) => {
    if (!e.endedAt) {
      return;
    }
    console.log(`[${new Date(e.endedAt).toLocaleString()}] ${e.id} ${colorState(e.state)} ${e.trigger.type} ${e.trigger.description}`);
    e.logs.slice(0, logLines).forEach((l) => {
      let toConsole = dim(`[${new Date(l.timestamp).toLocaleString()}] ${l.text.trim()}`);
      if (!fullLogLines && toConsole.length > Deno.consoleSize().columns) {
        toConsole = toConsole.slice(0, Deno.consoleSize().columns - 3) + "...";
      }
      console.log(toConsole);
    });
  });
}

export function colorState(state: string): string {
  switch (state) {
    case "success":
      return green(state.toUpperCase());
    case "failure":
      return red(state.toUpperCase());
    case "running":
      return cyan(state.toUpperCase());
    default:
      return dim(state.toUpperCase());
  }
}
