import { ExecutionDTO, getExecutions, getGlueByName, GlueDTO } from "../backend.ts";
import { cyan, dim, green, red } from "@std/fmt/colors";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { delay } from "@std/async/delay";
import { Spinner } from "@std/cli/unstable-spinner";

interface TailOptions {
  format: "table" | "json";
  number: number;
  noFollow?: boolean;
  logLines: number;
  fullLogLines?: boolean;
}

export const tail = async (options: TailOptions, name?: string) => {
  let glue: GlueDTO | undefined;

  if (name) {
    glue = await runStep("Loading glue...", () => getGlueByName(name, "deploy"));
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name when not running in a terminal");
  }

  if (!glue) {
    const errorMsg = name ? `Glue ${name} not found` : "No glue found";
    throw new Error(errorMsg);
  }

  const now = new Date();
  const historicalExecutions = await runStep(`Loading historical executions for ${glue.name}...`, () => getExecutions(glue.id, options.number, now, "desc"));
  historicalExecutions.reverse();
  renderExecutions(historicalExecutions, options.logLines, options.format, !!options.fullLogLines);

  let startingPoint = now;
  const pollingSpinner = new Spinner({ message: "Waiting for new executions...", color: "green" });
  while (!options.noFollow) {
    pollingSpinner.start();
    const executions = await getExecutions(glue.id, 10, startingPoint, "asc");
    if (executions.length > 0) {
      pollingSpinner.stop();
      renderExecutions(executions, options.logLines, options.format, !!options.fullLogLines);
      startingPoint = new Date(executions[executions.length - 1].startedAt);
      pollingSpinner.start();
    }
    await delay(1000);
  }
};

function renderExecutions(executions: ExecutionDTO[], logLines: number, format: "table" | "json", fullLogLines: boolean) {
  if (format === "table") {
    executions.forEach((e) => {
      console.log(`[${new Date(e.startedAt).toISOString()}] ${e.id} ${colorState(e.state)} ${e.trigger.type} ${e.trigger.description}`);
      e.logs.slice(0, logLines).forEach((l) => {
        let toConsole = dim(`[${new Date(l.timestamp).toISOString()}] ${l.text.trim()}`);
        if (!fullLogLines && toConsole.length > Deno.consoleSize().columns) {
          toConsole = toConsole.slice(0, Deno.consoleSize().columns - 3) + "...";
        }
        console.log(toConsole);
      });
    });
  } else {
    executions.forEach((e) => {
      if (e.logs) {
        e.logs = e.logs.slice(0, logLines);
      }
      console.log(JSON.stringify(e));
    });
  }
}

function colorState(state: string): string {
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
