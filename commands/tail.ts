import { DeploymentDTO, ExecutionDTO, getDeploymentById, getDeployments, getExecutions, getGlueById, getGlueByName, getGlues, GlueDTO } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui.ts";
import { runStep } from "../ui.ts";
import { askUserForGlue } from "./common.ts";
import { delay } from "@std/async/delay";

interface TailOptions {
  format: "table" | "json";
  number: number;
  noFollow?: boolean;
  logLines: number;
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
  renderExecutions(historicalExecutions, options.logLines, options.format);

  let startingPoint = now;
  while (!options.noFollow) {
    const executions = await runStep(`Loading executions for ${glue.name}...`, () => getExecutions(glue.id, 10, startingPoint, "asc"));
    if (executions.length > 0) {
      renderExecutions(executions, options.logLines, options.format);
      startingPoint = new Date(executions[executions.length - 1].startedAt);
    }
    await delay(1000);
  }
};

function renderExecutions(executions: ExecutionDTO[], logLines: number, format: "table" | "json") {
  if (format === "table") {
    // console.log(executions.map((e) => e.id).join("\n"));
  } else {
    executions.forEach((e) => {
      // if (e.logs) {
      //   e.logs = e.logs.slice(0, logLines);
      // }
      console.log(JSON.stringify(e));
    });
  }
}
