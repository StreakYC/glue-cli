import { createDeployment, createGlue, getGlueByName, type Runner, streamChangesTillDeploymentReady } from "../backend.ts";
import { render } from "ink";
import { DeployUI, type DeployUIProps } from "../ui/deploy.tsx";
import React from "react";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getCreateDeploymentParams } from "../lib/getCreateDeploymentParams.ts";
import { assertFileExists, getGlueName } from "../lib/glueNaming.ts";

interface DeployOptions {
  name?: string;
  runner: Runner;
}

export async function deploy(options: DeployOptions, file: string) {
  await checkForAuthCredsOtherwiseExit();

  await assertFileExists(file);
  const glueName = await getGlueName(file, options.name);

  let deploymentProgressProps: DeployUIProps = {
    uploadingCodeState: "not_started",
    codeAnalysisState: "not_started",
    uploadingCodeDuration: 0,
    codeAnalysisDuration: 0,
    deployment: undefined,
    glueName,
  };

  const updateUI = (patch: Partial<DeployUIProps>) => {
    deploymentProgressProps = { ...deploymentProgressProps, ...patch };
    render(React.createElement(DeployUI, deploymentProgressProps));
  };

  updateUI({ codeAnalysisState: "in_progress", codeAnalysisDuration: 0 });

  let duration = performance.now();

  const deploymentParams = await getCreateDeploymentParams(file, options.runner);
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

  for await (const deployment of streamChangesTillDeploymentReady(newDeploymentId)) {
    // modify the uploadingCodeStep at the same time as we get the first deployment so it never
    // looks to the user like we're done prematurely
    updateUI({ deployment, uploadingCodeState: "success", uploadingCodeDuration });
  }
}
