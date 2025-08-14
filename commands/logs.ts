import { type ExecutionDTO, getExecutions, getGlueByName, getGlues, type GlueDTO } from "../backend.ts";
import { cyan, dim, green, red } from "@std/fmt/colors";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { delay } from "@std/async/delay";
import { Spinner } from "@std/cli/unstable-spinner";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
interface LogsOptions {
  all?: boolean;
  json?: boolean;
  number: number;
  tail?: boolean;
  logLines: number;
  fullLogLines?: boolean;
  filter?: string;
  search?: string;
  failures?: boolean;
}

export const logs = async (options: LogsOptions, name?: string) => {
  await checkForAuthCredsOtherwiseExit();
  // look for sigint
  Deno.addSignalListener("SIGINT", () => {
    Deno.exit(0);
  });

  let glues: GlueDTO[] = [];
  if (options.all) {
    glues = await runStep("Loading all glues...", () => getGlues("deploy"), true, !!options.json);
  } else {
    let glue: GlueDTO | undefined = undefined;
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
    glues.push(glue);
  }

  if (options.failures) {
    options.filter = "failure";
  }

  const now = new Date();
  const scopeToGlueId = glues.length === 1 ? glues[0].id : undefined;
  const historicalExecutions = await runStep(
    `Loading historical executions...`,
    () => getExecutions(scopeToGlueId, options.number, now, "desc", !!options.json, options.filter, options.search),
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

  renderExecutions(historicalExecutions, options.logLines, !!options.fullLogLines, glues);

  let startingPoint = now;
  const pollingSpinner = new Spinner({ message: "Waiting for new executions...", color: "green" });
  while (options.tail) {
    pollingSpinner.start();
    const executions = await getExecutions(scopeToGlueId, 10, startingPoint, "asc", false, options.filter, options.search);
    if (executions.length > 0) {
      pollingSpinner.stop();
      renderExecutions(executions, options.logLines, !!options.fullLogLines, glues);
      startingPoint = new Date(executions[executions.length - 1].endedAt!);
      pollingSpinner.start();
    }
    await delay(1000);
  }
};

function renderExecutions(executions: ExecutionDTO[], logLines: number, fullLogLines: boolean, glues: GlueDTO[]) {
  const glueIdToName = glues.reduce((acc, g) => {
    acc[g.id] = g.name;
    return acc;
  }, {} as Record<string, string>);
  executions.forEach((e) => {
    if (!e.endedAt) {
      return;
    }
    const prefix = glues.length === 1 ? "" : ` ${glueIdToName[e.trigger.glueId]}`;
    console.log(`[${new Date(e.endedAt).toLocaleString()}]${prefix} ${e.id} ${colorState(e.state)} ${e.trigger.type} ${e.trigger.description}`);
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
