import { getDeployments, getGlueByName, type GlueDTO } from "../backend.ts";
import { Table } from "@cliffy/table";
import { formatBuildSteps, formatDeploymentStatus, formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
interface DeploymentsOptions {
  json?: boolean;
}

export const deployments = async (options: DeploymentsOptions, name?: string) => {
  await checkForAuthCredsOtherwiseExit();
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

  const deployments = await runStep(`Loading deployments for ${glue.name}...`, () => getDeployments(glue.id));
  deployments.sort((a, b) => b.createdAt - a.createdAt);

  if (options.json) {
    console.log(JSON.stringify(deployments, null, 2));
    return;
  }

  console.log("");
  console.log("DEPLOYMENTS");
  new Table()
    .header(["Id", "Status", "Created", "Triggers", "Build steps"])
    .body(
      deployments.map((
        deployment,
      ) => [
        deployment.id,
        formatDeploymentStatus(deployment.status, deployment.id === glue.currentDeploymentId),
        formatEpochMillis(deployment.createdAt),
        deployment.triggers.length,
        formatBuildSteps(deployment.buildSteps),
      ]),
    )
    .padding(4)
    .render();
};
