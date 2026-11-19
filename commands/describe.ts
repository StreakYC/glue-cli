import {
  getAccountById,
  getDeploymentById,
  getDeployments,
  getExecutionById,
  getGlueById,
  getGluesByName,
  type GlueDTO,
} from "../backend.ts";
import { findGlueByName, type WorkspaceOptions } from "../lib/workspaces.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import React from "react";
import { delay } from "@std/async/delay";
import { type Instance, render } from "ink";
import {
  DescribeAccountUI,
  DescribeDeploymentUI,
  DescribeExecutionUI,
  DescribeGlueUI,
  DescribeUI,
} from "../ui/describe.tsx";
import { isPrefixId } from "../common.ts";

interface DescribeOptions extends WorkspaceOptions {
  json?: boolean;
  watch?: boolean;
}

const WATCH_INTERVAL_MS = 3_000;

interface DescribeTarget {
  kind: "glue" | "deployment" | "account" | "execution";
  load: () => Promise<{
    data: unknown;
    toReactElement: () => React.ReactElement;
  }>;
}

let describeInkInstance: Instance | undefined;

export const describe = async (options: DescribeOptions, query?: string) => {
  await checkForAuthCredsOtherwiseExit();

  if (options.watch && options.json) {
    throw new Error("The --watch flag can't be combined with --json output");
  }

  if (!query) {
    if (options.json) {
      throw new Error("You must provide a glue name or query when outputting in JSON format");
    }
    if (!Deno.stdout.isTerminal()) {
      throw new Error("You must provide a glue name or query when not running in a terminal");
    }
    const glue = await askUserForGlue(options);
    if (!glue) {
      throw new Error("No glues yet!?");
    }
    query = glue.id;
  }

  const target = await createDescribeTarget(query, options);
  const initialLoadResult = await runStep(
    `Loading ${target.kind}...`,
    () => target.load(),
    true,
    !!options.json,
  );

  if (options.json) {
    console.log(JSON.stringify(initialLoadResult.data, null, 2));
    return;
  }

  try {
    renderTarget(initialLoadResult.toReactElement(), !!options.watch);
    if (options.watch) {
      while (true) {
        await delay(WATCH_INTERVAL_MS);
        const loadResult = await target.load();
        renderTarget(loadResult.toReactElement(), options.watch);
      }
    }
  } finally {
    if (describeInkInstance) {
      describeInkInstance.unmount();
      describeInkInstance = undefined;
      await delay(1);
    }
  }
  Deno.exit();
};

async function createDescribeTarget(
  query: string,
  options: DescribeOptions,
): Promise<DescribeTarget> {
  if (isPrefixId(query, "d")) {
    return createDeploymentTarget(query);
  }
  if (isPrefixId(query, "g")) {
    return createGlueTargetById(query);
  }
  if (isPrefixId(query, "a")) {
    return createAccountTarget(query);
  }
  if (isPrefixId(query, "e")) {
    return createExecutionTarget(query);
  }
  // Resolve the name up front, since it may prompt to pick between workspaces.
  const glue = await findGlueByName(query, "deploy", options, { quiet: !!options.json });
  if (!glue) {
    throw new Error("Couldn't find a glue with that name");
  }
  return createGlueTargetByName(glue);
}

function createDeploymentTarget(deploymentId: string): DescribeTarget {
  return {
    kind: "deployment",
    load: async () => {
      const deployment = await getDeploymentById(deploymentId, true);
      if (!deployment) {
        throw new Error("Couldn't find a deployment with that id");
      }
      return {
        data: deployment,
        toReactElement: () => React.createElement(DescribeDeploymentUI, { deployment }),
      };
    },
  };
}

function createGlueTargetById(glueId: string): DescribeTarget {
  return {
    kind: "glue",
    load: async () => {
      const glue = await getGlueById(glueId);
      if (!glue) {
        throw new Error("Couldn't find a glue with that id");
      }
      const deployments = await getDeployments(glue.id);
      const glueAndDeployments = { glue, deployments };
      return {
        data: glueAndDeployments,
        toReactElement: () => React.createElement(DescribeGlueUI, { glueAndDeployments }),
      };
    },
  };
}

/**
 * Describes a glue found by name. If it's deleted and recreated while
 * watching, the new glue with that name in the same workspace is shown.
 */
function createGlueTargetByName(initialGlue: GlueDTO): DescribeTarget {
  let glueId = initialGlue.id;
  return {
    kind: "glue",
    load: async () => {
      let glue: GlueDTO | undefined = await getGlueById(glueId);
      if (!glue) {
        glue = (await getGluesByName(initialGlue.name, "deploy", [initialGlue.workspaceId]))[0];
      }

      if (!glue) {
        throw new Error("Couldn't find a glue with that name");
      }

      glueId = glue.id;

      const deployments = await getDeployments(glue.id);
      const glueAndDeployments = { glue, deployments };
      return {
        data: glueAndDeployments,
        toReactElement: () => React.createElement(DescribeGlueUI, { glueAndDeployments }),
      };
    },
  };
}

function createAccountTarget(accountId: string): DescribeTarget {
  return {
    kind: "account",
    load: async () => {
      const account = await getAccountById(accountId);
      if (!account) {
        throw new Error("Couldn't find an account with that id");
      }
      return {
        data: account,
        toReactElement: () => React.createElement(DescribeAccountUI, { account }),
      };
    },
  };
}

function createExecutionTarget(executionId: string): DescribeTarget {
  return {
    kind: "execution",
    load: async () => {
      const execution = await getExecutionById(executionId);
      if (!execution) {
        throw new Error("Couldn't find an execution with that id");
      }
      return {
        data: execution,
        toReactElement: () => React.createElement(DescribeExecutionUI, { execution }),
      };
    },
  };
}

function renderTarget(targetReactElement: React.ReactElement, watch: boolean) {
  if (!describeInkInstance) {
    describeInkInstance = render(
      React.createElement(DescribeUI, { target: targetReactElement, isWatching: watch }),
    );
  } else {
    describeInkInstance.rerender(
      React.createElement(DescribeUI, { target: targetReactElement, isWatching: watch }),
    );
  }
}
