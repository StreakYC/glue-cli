import {
  getAccountById,
  getDeploymentById,
  getDeployments,
  getExecutionById,
  getGlueById,
  getGlueByName,
  type GlueDTO,
} from "../backend.ts";
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

interface DescribeOptions {
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
    const glue = await askUserForGlue();
    if (!glue) {
      throw new Error("No glues yet!?");
    }
    query = glue.id;
  }

  const target = createDescribeTarget(query);
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
    if (!options.watch) {
      return;
    }

    while (true) {
      await delay(WATCH_INTERVAL_MS);
      const loadResult = await target.load();
      renderTarget(loadResult.toReactElement(), options.watch);
    }
  } finally {
    if (describeInkInstance) {
      describeInkInstance.unmount();
      describeInkInstance = undefined;
      await delay(1);
    }
  }
};

function createDescribeTarget(query: string): DescribeTarget {
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
  return createGlueTargetByName(query);
}

function createDeploymentTarget(deploymentId: string): DescribeTarget {
  return {
    kind: "deployment",
    load: async () => {
      const deployment = await getDeploymentById(deploymentId);
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

function createGlueTargetByName(glueName: string): DescribeTarget {
  let glueId: string | undefined;
  return {
    kind: "glue",
    load: async () => {
      let glue: GlueDTO | undefined;
      if (glueId) {
        glue = await getGlueById(glueId);
        if (!glue) {
          glue = await getGlueByName(glueName, "deploy");
        }
      } else {
        glue = await getGlueByName(glueName, "deploy");
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
