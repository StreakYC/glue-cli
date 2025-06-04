import {
  type AccountDTO,
  type DeploymentDTO,
  type ExecutionDTO,
  getAccountById,
  getDeploymentById,
  getExecutionById,
  getGlueById,
  getGlueByName,
  type GlueDTO,
} from "../backend.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { bold, dim, green, red } from "@std/fmt/colors";
import { colorState } from "./tail.ts";
import { getRunningStringForDeploymentStatus } from "./list.ts";
import React from "react";
import { render } from "ink";
import { DescribeDeploymentUI } from "../ui/describe.tsx";
interface DescribeOptions {
  json?: boolean;
}

export const describe = async (options: DescribeOptions, query?: string) => {
  await checkForAuthCredsOtherwiseExit();
  let glue: GlueDTO | undefined;
  let deployment: DeploymentDTO | undefined;
  let account: AccountDTO | undefined;
  let execution: ExecutionDTO | undefined;

  if (query) {
    if (isPrefixId(query, "d")) {
      deployment = await runStep("Loading deployment...", () => getDeploymentById(query));
    } else if (isPrefixId(query, "g")) {
      glue = await runStep("Loading glue...", () => getGlueById(query));
    } else if (isPrefixId(query, "a")) {
      account = await runStep("Loading account...", () => getAccountById(query));
    } else if (isPrefixId(query, "e")) {
      execution = await runStep("Loading execution...", () => getExecutionById(query));
    } else {
      glue = await runStep("Loading glue...", () => getGlueByName(query, "deploy"));
    }
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name or query when not running in a terminal");
  }

  if (!deployment && !glue && !account && !execution) {
    throw new Error("Couldn't find a glue or deployment or account or execution with that id nor a glue with that name");
  }

  if (deployment) {
    renderDeployment(deployment, options);
  } else if (glue) {
    renderGlue(glue, options);
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

function renderGlue(glue: GlueDTO, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(glue, null, 2));
    return;
  }

  console.log(`${bold(glue.name)} ${dim(`(${glue.id})`)}`);
  console.log(`Status: ${getRunningStringForDeploymentStatus(glue.currentDeployment?.status ?? "cancelled")}`);
  console.log(`Created: ${new Date(glue.createdAt).toLocaleString()}`);
  console.log(`Number of runs: ${glue.executionSummary.count}`);
  console.log(`Last run: ${new Date(glue.executionSummary.mostRecent).toLocaleString()}`);
  if (glue.currentDeployment) {
    console.log(`Last Deployed: ${new Date(glue.currentDeployment.createdAt).toLocaleString()}`);
    console.log("Triggers:");
    for (const t of glue.currentDeployment.triggers.toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) {
      console.log(`\t${t.type} (${t.label}): ${dim(t.description ?? "")}`);
    }
  }
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
  console.log(`Trigger: ${execution.trigger.description}`);
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

function isPrefixId(query: string, prefix: string) {
  // prefix ids are like d_34f4000000000000 or g_1800000000000000 or d_e18000000000000
  // use a regex to check if the query starts with the prefix, then underscore then followed by any number of hex digits
  const regex = new RegExp(`^${prefix}_[0-9a-f]{1,}$`);
  return regex.test(query);
}
