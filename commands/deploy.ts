import { basename, dirname, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import { exists } from "@std/fs/exists";
import { runStep } from "../ui.ts";
import { createDeployment, CreateDeploymentParams, createGlue, DeploymentAsset, getBuildLogs, getGlueById, getGlueByName } from "../backend.ts";

interface DeployOptions {
  name?: string;
}

export async function deploy(options: DeployOptions, file: string) {
  const glueName = options.name ?? basename(file);

  const deploymentParams = await getCreateDeploymentParams(file);

  const existingGlue = await runStep("Checking for an existing glue", () => getGlueByName(glueName, "deploy"));

  let newDeploymentId: string;
  let glueId: string;
  if (!existingGlue) {
    const newGlue = await runStep("Creating glue", () => createGlue(glueName, deploymentParams, "deploy"));
    if (!newGlue.currentDeploymentId) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.currentDeploymentId;
    glueId = newGlue.id;
  } else {
    const newDeployment = await runStep("Creating new deployment", () => createDeployment(existingGlue.id, deploymentParams));
    newDeploymentId = newDeployment.id;
    glueId = existingGlue.id;
  }

  await runStep("Watching deployment logs", async () => {
    for await (const deployment of getBuildLogs(newDeploymentId)) {
      console.log(deployment.buildSteps);
    }
  });

  const glue = await runStep("Fetching glue", async () => {
    const glue = await getGlueById(glueId);
    if (!glue) {
      throw new Error("Glue not found");
    }
    return glue;
  });

  const triggersString = glue.currentDeployment?.triggers
    ?.sort((a, b) => a.type.localeCompare(b.type))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((t) => `    ${t.type} ${t.label}: ${t.description}`)
    .join("\n");
  console.log(`  Triggers:\n${triggersString}`);
}

async function getCreateDeploymentParams(file: string): Promise<CreateDeploymentParams> {
  // For now, we're just uploading all .js/.ts files in the same directory as
  // the entry point. TODO follow imports and only upload necessary files.

  const fileDir = dirname(file);
  const entryPointUrl = relative(fileDir, file);

  const filesToUpload: string[] = [entryPointUrl];

  const uploadIfExists = ["deno.json"];
  for (const file of uploadIfExists) {
    if (await exists(file)) {
      filesToUpload.push(file);
    }
  }

  for await (
    const dirEntry of walk(fileDir, {
      exts: ["ts", "js"],
      includeDirs: false,
    })
  ) {
    const relativePath = relative(fileDir, dirEntry.path);
    filesToUpload.push(relativePath);
  }

  return {
    deploymentContent: {
      entryPointUrl,
      assets: Object.fromEntries(
        await Promise.all(filesToUpload
          .map(async (file): Promise<[string, DeploymentAsset]> => [
            file,
            { kind: "file", content: await Deno.readTextFile(file) },
          ])),
      ),
    },
  };
}
