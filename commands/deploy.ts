import * as path from "@std/path";
import { load as dotenvLoad } from "@std/dotenv";
import { walk } from "@std/fs/walk";
import { exists } from "@std/fs/exists";
import { createDeployment, type CreateDeploymentParams, createGlue, type DeploymentAsset, getGlueByName, streamChangesToDeployment } from "../backend.ts";
import { render } from "ink";
import { DeployUI, type DeployUIProps } from "../ui/deploy.tsx";
import React from "react";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";

interface DeployOptions {
  name?: string;
}

export async function deploy(options: DeployOptions, file: string) {
  await checkForAuthCredsOtherwiseExit();

  let deploymentProgressProps: DeployUIProps = {
    uploadingCodeState: "not_started",
    codeAnalysisState: "not_started",
    uploadingCodeDuration: 0,
    codeAnalysisDuration: 0,
    deployment: undefined,
  };

  const updateUI = (patch: Partial<DeployUIProps>) => {
    deploymentProgressProps = { ...deploymentProgressProps, ...patch };
    render(React.createElement(DeployUI, deploymentProgressProps));
  };

  updateUI({ codeAnalysisState: "in_progress", codeAnalysisDuration: 0 });

  let duration = performance.now();
  const glueName = options.name ?? path.basename(file);
  const deploymentParams = await getCreateDeploymentParams(file);
  updateUI({ codeAnalysisDuration: performance.now() - duration, codeAnalysisState: "success" });

  duration = performance.now();
  updateUI({ uploadingCodeState: "in_progress", uploadingCodeDuration: 0 });
  const existingGlue = await getGlueByName(glueName, "deploy");
  let newDeploymentId: string;
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, deploymentParams, "deploy");
    if (!newGlue.pendingDeployment) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.pendingDeployment.id;
  } else {
    const newDeployment = await createDeployment(existingGlue.id, deploymentParams);
    newDeploymentId = newDeployment.id;
  }

  const uploadingCodeDuration = performance.now() - duration;

  for await (const deployment of streamChangesToDeployment(newDeploymentId)) {
    // modify the uploadingCodeStep at the same time as we get the first deployment so it never
    // looks to the user like we're done prematurely
    updateUI({ deployment, uploadingCodeState: "success", uploadingCodeDuration });
  }
}

async function getCreateDeploymentParams(file: string): Promise<CreateDeploymentParams> {
  // For now, we're just uploading all .js/.ts files in the same directory as
  // the entry point. TODO follow imports and only upload necessary files.

  const fileDir = path.dirname(file);
  const entryPointUrl = path.relative(fileDir, file);

  const envVars = await dotenvLoad({ envPath: path.join(fileDir, ".env") });

  /** Contains filenames relative to fileDir. */
  const filesToUpload = new Set<string>([entryPointUrl]);

  const uploadIfExists = ["deno.json", "deno.jsonc", "deno.lock"];
  for (const file of uploadIfExists) {
    if (await exists(path.join(fileDir, file))) {
      filesToUpload.add(file);
    }
  }

  for await (
    const dirEntry of walk(fileDir, {
      exts: ["ts", "js"],
      includeDirs: false,
    })
  ) {
    const relativePath = path.relative(fileDir, dirEntry.path);
    filesToUpload.add(relativePath);
  }

  return {
    deploymentContent: {
      entryPointUrl,
      assets: Object.fromEntries(
        await Promise.all(
          filesToUpload.values()
            .map(async (file): Promise<[string, DeploymentAsset]> => [
              file,
              { kind: "file", content: await Deno.readTextFile(path.join(fileDir, file)) },
            ]),
        ),
      ),
      envVars,
    },
  };
}
