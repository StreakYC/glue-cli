import { type DeploymentDTO, getDeploymentById, getDeployments, getGlueById, getGlueByName, type GlueDTO } from "../backend.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";

interface DescribeOptions {
  json?: boolean;
}

export const describe = async (options: DescribeOptions, query?: string) => {
  let glue: GlueDTO | undefined;
  let deployment: DeploymentDTO | undefined;

  if (query) {
    if (isPrefixId(query, "d")) {
      deployment = await runStep("Loading deployment...", () => getDeploymentById(query));
    } else if (isPrefixId(query, "g")) {
      glue = await runStep("Loading glue...", () => getGlueById(query));
    } else {
      glue = await runStep("Loading glue...", () => getGlueByName(query, "deploy"));
    }
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name or query when not running in a terminal");
  }

  if (!deployment && !glue) {
    throw new Error("Couldn't find a glue or deployment with that id nor a glue with that name");
  }

  if (deployment) {
    renderDeployment(deployment, options);
  } else if (glue) {
    const deployments = await runStep(`Loading deployments for ${glue.name}...`, () => getDeployments(glue.id));
    renderGlueAndDeployments(glue, deployments, options);
  }
};

function renderDeployment(deployment: DeploymentDTO, options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify(deployment, null, 2));
    return;
  }
  // render it nicely with build steps
}

function renderGlueAndDeployments(glue: GlueDTO, deployments: DeploymentDTO[], options: DescribeOptions) {
  if (options.json) {
    console.log(JSON.stringify({ ...glue, deployments: deployments }, null, 2));
    return;
  }
  console.log(glue.name);
}

function isPrefixId(query: string, prefix: string) {
  // prefix ids are like d_34f4000000000000 or g_1800000000000000 or d_e18000000000000
  // use a regex to check if the query starts with the prefix, then underscore then followed by any number of hex digits
  const regex = new RegExp(`^${prefix}_[0-9a-f]{1,}$`);
  return regex.test(query);
}
