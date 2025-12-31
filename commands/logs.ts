import {
  type ExecutionDTO,
  getDeploymentById,
  getExecutions,
  getGlueById,
  getGlueByName,
} from "../backend.ts";
import { cyan, dim, green, red } from "@std/fmt/colors";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { delay } from "@std/async/delay";
import { Spinner } from "@std/cli/unstable-spinner";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { isPrefixId } from "../common.ts";
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

export const logs = async (options: LogsOptions, query?: string) => {
  await checkForAuthCredsOtherwiseExit();
  // look for sigint
  Deno.addSignalListener("SIGINT", () => {
    Deno.exit(0);
  });

  let glueId: string | undefined;
  let deploymentId: string | undefined;

  if (query) {
    if (isPrefixId(query, "g")) {
      const glue = await runStep("Loading glue...", () => getGlueById(query), true, !!options.json);
      if (!glue) {
        throw new Error("Couldn't find a glue with that id");
      }
      glueId = query;
    } else if (isPrefixId(query, "d")) {
      const deployment = await runStep(
        "Loading deployment...",
        () => getDeploymentById(query),
        true,
        !!options.json,
      );
      if (!deployment) {
        throw new Error("Couldn't find a deployment with that id");
      }
      deploymentId = query;
    } else {
      const glue = await runStep(
        "Loading glue...",
        () => getGlueByName(query, "deploy"),
        true,
        !!options.json,
      );
      if (!glue) {
        throw new Error("Couldn't find a glue with that name");
      }
      glueId = glue.id;
    }
  } else if (Deno.stdout.isTerminal() && !options.json) {
    const glue = await askUserForGlue();
    if (!glue) {
      throw new Error("No glues yet!?");
    }
    glueId = glue.id;
  } else {
    throw new Error(
      "You must provide a glue name, glue id or deployment id when not running in a terminal",
    );
  }

  if (options.failures) {
    options.filter = "failure";
  }

  const commandStartTime = new Date();
  const historicalExecutions = await runStep(
    `Loading historical executions...`,
    () =>
      getExecutions(
        options.number,
        commandStartTime,
        "desc",
        !!options.json,
        options.filter,
        options.search,
        glueId,
        deploymentId,
      ),
    true,
    !!options.json,
  );

  // we requested the executions in descending order, so we need to reverse them to get them to get the
  // most recent executions printed out last which is necessary if the user wants to tail the executions.
  historicalExecutions.reverse();

  if (options.json) {
    historicalExecutions.forEach((e) => {
      console.log(JSON.stringify(e));
    });
    return;
  }

  renderExecutions(historicalExecutions, options.logLines, !!options.fullLogLines);

  let startingPoint = commandStartTime;
  const pollingSpinner = new Spinner({ message: "Waiting for new executions...", color: "green" });
  while (options.tail) {
    pollingSpinner.start();
    const executions = await getExecutions(
      10,
      startingPoint,
      "asc",
      false,
      options.filter,
      options.search,
      glueId,
      deploymentId,
    );
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
    console.log(
      `[${new Date(e.endedAt).toLocaleString()}] ${e.id} ${
        colorState(e.state)
      } ${e.trigger.type} ${e.trigger.description}`,
    );
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
