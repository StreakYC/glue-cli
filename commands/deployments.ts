import { getDeployments, getGlueByName, getGlues, GlueDTO } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui.ts";
import { runStep } from "../ui.ts";

import { Select } from "@cliffy/prompt/select";

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
    const glues = await runStep("Loading glues...", async () => {
      const glues = await getGlues("deploy");
      if (glues.length === 0) {
        throw new Error("No glues found");
      }
      return glues;
    });
    glue = await Select.prompt({
      message: "Choose a glue",
      search: true,
      options: glues.map((glue) => ({ name: glue.name, value: glue })),
    });
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

  // TODO make this table better
  new Table()
    // .header(["Name", "State", "Created", "Last deployed"])
    .body(
      deployments.map((
        deployment,
      ) => [
        deployment.id,
      ]),
    )
    .padding(4)
    .render();
};
