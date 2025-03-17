import { basename, dirname, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import { exists } from "@std/fs/exists";
import { createDeployment, CreateDeploymentParams, createGlue, DeploymentAsset, getGlueByName, streamChangesToDeployment } from "../backend.ts";
import { render } from "ink";
import { DeployUI, DeployUIProps } from "../ui/DeployUI.tsx";
import React from "react";
interface DeployOptions {
  name?: string;
}

export async function deploy(options: DeployOptions, file: string) {
  const glueName = options.name ?? basename(file);
  const deploymentProgressProps: DeployUIProps = {
    existingGlueState: "not_started",
    codeAnalysisState: "checking",
    existingGlueDuration: 0,
    codeAnalysisDuration: 0,
  };
  render(React.createElement(DeployUI, deploymentProgressProps));

  let duration = performance.now();
  const deploymentParams = await getCreateDeploymentParams(file);
  deploymentProgressProps.codeAnalysisDuration = performance.now() - duration;
  deploymentProgressProps.codeAnalysisState = "done";
  deploymentProgressProps.existingGlueState = "checking";
  render(React.createElement(DeployUI, deploymentProgressProps));

  duration = performance.now();
  const existingGlue = await getGlueByName(glueName, "deploy");
  deploymentProgressProps.existingGlueDuration = performance.now() - duration;
  let newDeploymentId: string;
  if (!existingGlue) {
    deploymentProgressProps.existingGlueState = "creatingNewGlue";
    render(React.createElement(DeployUI, deploymentProgressProps));
    const newGlue = await createGlue(glueName, deploymentParams, "deploy");
    if (!newGlue.currentDeploymentId) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.currentDeploymentId;
  } else {
    deploymentProgressProps.existingGlueState = "usedExistingGlue";
    render(React.createElement(DeployUI, deploymentProgressProps));
    const newDeployment = await createDeployment(existingGlue.id, deploymentParams);
    deploymentProgressProps.deployment = newDeployment;
    render(React.createElement(DeployUI, deploymentProgressProps));
    newDeploymentId = newDeployment.id;
  }

  for await (const deployment of streamChangesToDeployment(newDeploymentId)) {
    deploymentProgressProps.deployment = deployment;
    render(React.createElement(DeployUI, deploymentProgressProps));
  }
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
