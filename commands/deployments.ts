import { getDeployments, getGlueByName, GlueDTO } from "../backend.ts";
import { Table } from "@cliffy/table";
import { formatBuildSteps, formatDeploymentStatus, formatEpochMillis } from "../ui.ts";
import { runStep } from "../ui.ts";
import { askUserForGlue } from "./common.ts";

interface DeploymentsOptions {
  format?: "table" | "json";
}

export const deployments = async (options: DeploymentsOptions, name?: string) => {
  let glue: GlueDTO;

  if (name) {
    glue = await runStep("Loading glue...", async () => {
      const glueByName = await getGlueByName(name, "deploy");
      if (!glueByName) {
        throw new Error(`Glue ${name} not found`);
      }
      return glueByName;
    });
  } else if (Deno.stdout.isTerminal()) {
    glue = await askUserForGlue();
  } else {
    throw new Error("You must provide a glue name when not running in a terminal");
  }

  const deployments = await runStep(`Loading deployments for ${glue.name}...`, async () => {
    return await getDeployments(glue.id);
  });

  if (options.format === "json") {
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
        formatDeploymentStatus(deployment.status),
        formatEpochMillis(deployment.createdAt),
        deployment.triggers.length,
        formatBuildSteps(deployment.buildSteps),
      ]),
    )
    .padding(4)
    .render();
};
