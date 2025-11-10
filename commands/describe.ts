import {
  type AccountDTO,
  type DeploymentDTO,
  type ExecutionDTO,
  getAccountById,
  getDeploymentById,
  getDeployments,
  getExecutionById,
  getGlueById,
  getGlueByName,
  type GlueDTO,
} from "../backend.ts";
import * as mod from "@std/fmt/colors";
import { formatBuildSteps, formatDeploymentStatus, formatEpochMillis, runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { bold, dim, green, red } from "@std/fmt/colors";
import { colorState } from "./logs.ts";
import { getRunningStringForDeploymentStatus } from "./list.ts";
import React from "react";
import { render } from "ink";
import { DescribeDeploymentUI } from "../ui/describe.tsx";
import { Table } from "@cliffy/table";
import { isPrefixId } from "../common.ts";

interface DescribeOptions {
  json?: boolean;
}

interface GlueAndDeployments {
  glue: GlueDTO;
  deployments: DeploymentDTO[];
}

export const describe = async (options: DescribeOptions, query?: string) => {
  await checkForAuthCredsOtherwiseExit();
  let glueAndDeployments: GlueAndDeployments | undefined;
  let deployment: DeploymentDTO | undefined;
  let account: AccountDTO | undefined;
  let execution: ExecutionDTO | undefined;

  if (query) {
    if (isPrefixId(query, "d")) {
      deployment = await runStep("Loading deployment...", () => getDeploymentById(query), true, !!options.json);
    } else if (isPrefixId(query, "g")) {
      const glue = await runStep("Loading glue...", () => getGlueById(query), true, !!options.json);
      if (!glue) {
        throw new Error("Couldn't find a glue with that id");
      }
      const deployments = await runStep("Loading deployments...", () => getDeployments(glue.id), true, !!options.json);
      glueAndDeployments = { glue, deployments };
    } else if (isPrefixId(query, "a")) {
      account = await runStep("Loading account...", () => getAccountById(query), true, !!options.json);
    } else if (isPrefixId(query, "e")) {
      execution = await runStep("Loading execution...", () => getExecutionById(query), true, !!options.json);
    } else {
      const glue = await runStep("Loading glue...", () => getGlueByName(query, "deploy"), true, !!options.json);
      if (!glue) {
        throw new Error("Couldn't find a glue with that name");
      }
      const deployments = await runStep("Loading deployments...", () => getDeployments(glue.id), true, !!options.json);
      glueAndDeployments = { glue, deployments };
    }
  } else if (Deno.stdout.isTerminal() && !options.json) {
    const glue = await askUserForGlue();
    if (!glue) {
      throw new Error("No glues yet!?");
    }
    const deployments = await runStep("Loading deployments...", () => getDeployments(glue.id), true, !!options.json);
    glueAndDeployments = { glue, deployments };
  } else {
    throw new Error("You must provide a glue name or query when not running in a terminal");
  }

  if (!deployment && !glueAndDeployments && !account && !execution) {
    throw new Error("Couldn't find a glue or deployment or account or execution with that id nor a glue with that name");
  }

  console.log();
  if (deployment) {
    renderDeployment(deployment, options);
  } else if (glueAndDeployments) {
    renderGlue(glueAndDeployments, options);
  } else if (account) {
    renderAccount(account, options);
  } else if (execution) {
    renderExecution(execution, options);
  }
};

function renderDeployment(deployment: DeploymentDTO, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(deployment, null, 2));
    return;
  }

  render(React.createElement(DescribeDeploymentUI, { deployment }));
}

function renderGlue(glueAndDeployments: GlueAndDeployments, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(glueAndDeployments, null, 2));
    return;
  }
  const { glue, deployments } = glueAndDeployments;

  console.log(`${bold(glue.name)} ${dim(`(${glue.id})`)}`);
  console.log(`Status: ${getRunningStringForDeploymentStatus(glue.currentDeployment?.status ?? "cancelled")}`);
  console.log(`Created: ${formatEpochMillis(glue.createdAt)}`);
  console.log();

  const goodRuns = (glue.executionSummary.totalCount - glue.executionSummary.totalErrorCount).toString();
  const badRuns = glue.executionSummary.totalErrorCount.toString();
  const goodRunsSinceLastDeployment = (glue.executionSummary.currentDeploymentCount - glue.executionSummary.currentDeploymentErrorCount).toString();
  const badRunsSinceLastDeployment = glue.executionSummary.currentDeploymentErrorCount.toString();

  console.log(
    `Runs: ${mod.green(goodRuns)} successful` +
      (glue.executionSummary.totalErrorCount > 0 ? `, ${mod.red(badRuns)} failed` : ""),
  );
  console.log(
    `Runs since last deployment: ${mod.green(goodRunsSinceLastDeployment)} successful` +
      (glue.executionSummary.currentDeploymentErrorCount > 0 ? `, ${mod.red(badRunsSinceLastDeployment)} failed` : ""),
  );
  console.log();
  console.log(`Last run: ${formatEpochMillis(glue.executionSummary.mostRecent)}`);
  if (glue.currentDeployment) {
    console.log(`Last Deployed: ${formatEpochMillis(glue.currentDeployment.createdAt)}`);
    console.log();
    console.log("TRIGGERS");
    for (const t of glue.currentDeployment.triggers.toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) {
      console.log(`\t${t.type} (${t.label}): ${dim(t.description ?? "")}`);
    }
  }

  deployments.sort((a, b) => b.createdAt - a.createdAt);

  console.log("");
  console.log("DEPLOYMENTS");
  new Table()
    .header(["Id", "Status", "Created", "Triggers", "Build steps"])
    .body(
      deployments.map((
        deployment,
      ) => [
        deployment.id,
        formatDeploymentStatus(deployment.status, deployment.id === glue.currentDeployment?.id),
        formatEpochMillis(deployment.createdAt),
        deployment.triggers.length,
        formatBuildSteps(deployment.buildSteps),
      ]),
    )
    .padding(4)
    .render();
}

function renderAccount(account: AccountDTO, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }
  console.log(`${dim("ID: " + bold(account.id))}`);
  console.log(`${dim("Type: " + account.type)}`);
  console.log(`${dim("Label: " + account.selector)}`);
  console.log(`${dim("Created: " + new Date(account.createdAt).toLocaleString())}`);

  if (account.displayName) {
    console.log(`${dim("Name: " + account.displayName)}`);
  }
  if (account.redactedApiKey) {
    console.log(`${dim("API Key: " + account.redactedApiKey)}`);
  }
  if (account.scopes && account.scopes.length > 0) {
    console.log(`${dim("Scopes: " + account.scopes?.join(", "))}`);
  }

  console.log(`Created: ${new Date(account.createdAt).toLocaleString()}`);
  if (account.liveGlues.length > 0) {
    console.log("Live Glues:");
    for (const glue of account.liveGlues) {
      console.log(`\t${green(glue.name) + (glue.environment === "dev" ? "[DEV]" : "")} (${dim(glue.id)})`);
    }
  }
}

function renderExecution(execution: ExecutionDTO, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(execution, null, 2));
    return;
  }
  console.log(`${bold(execution.id)}`);
  console.log(`Trigger: ${execution.trigger.type} (${execution.trigger.label}): ${execution.trigger.description}`);
  console.log(`Status: ${colorState(execution.state)}`);
  console.log(`Started: ${new Date(execution.startedAt).toLocaleString()}`);
  console.log(`Completed: ${execution.endedAt ? new Date(execution.endedAt).toLocaleString() : "Not completed"}`);
  console.log(`Duration: ${execution.endedAt ? execution.endedAt - execution.startedAt : "Not completed"}ms`);
  if (execution.logs.length > 0) {
    console.log(`--------------------------------`);
    console.log("Logs:");
    for (const log of execution.logs) {
      console.log(`${log.type === "stdout" ? green(new Date(log.timestamp).toLocaleString()) : red(new Date(log.timestamp).toLocaleString())} ${log.text}`);
    }
  }
  console.log(`--------------------------------`);
  console.log("Input Data:");
  console.log(JSON.stringify(execution.inputData, null, 2));
}
