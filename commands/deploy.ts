import {
  createDeployment,
  createGlue,
  getGlueByName,
  type Runner,
  streamChangesTillDeploymentReady,
  updateGlue,
} from "../backend.ts";
import { type Instance, render } from "ink";
import { DeployUI, type DeployUIProps } from "../ui/deploy.tsx";
import React from "react";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getCreateDeploymentParams } from "../lib/getCreateDeploymentParams.ts";
import { getGlueName } from "../lib/glueNaming.ts";
import { addTags, normalizeTags } from "../lib/tagUtils.ts";
import { kv } from "../db.ts";
import { GLUE_API_SERVER } from "../common.ts";
import { Confirm } from "@cliffy/prompt/confirm";
import { resolve } from "@std/path/resolve";

interface DeployOptions {
  name?: string;
  runner: Runner;
  tags?: string[];
}

export async function deploy(options: DeployOptions, file: string) {
  await checkForAuthCredsOtherwiseExit();

  const glueName = await getGlueName(file, options.name);
  const tags = normalizeTags(options.tags);

  let deploymentProgressProps: DeployUIProps = {
    uploadingCodeState: "not_started",
    codeAnalysisState: "not_started",
    uploadingCodeDuration: 0,
    codeAnalysisDuration: 0,
    deployment: undefined,
    glueName,
  };

  let instance: Instance | undefined;
  const unmountUI = () => {
    if (instance) {
      instance.unmount();
      instance = undefined;
    }
  };
  const updateUI = (patch: Partial<DeployUIProps>) => {
    deploymentProgressProps = { ...deploymentProgressProps, ...patch };
    const element = React.createElement(DeployUI, deploymentProgressProps);
    if (instance) {
      instance.rerender(element);
    } else {
      instance = render(element);
    }
  };

  updateUI({ codeAnalysisState: "in_progress", codeAnalysisDuration: 0 });

  let duration = performance.now();

  const deploymentParams = await getCreateDeploymentParams(file, options.runner);
  updateUI({ codeAnalysisDuration: performance.now() - duration, codeAnalysisState: "success" });

  duration = performance.now();
  updateUI({ uploadingCodeState: "in_progress", uploadingCodeDuration: 0 });
  const absPath = resolve(file);
  let existingGlue = await getGlueByName(glueName, "deploy");
  let newDeploymentId: string;
  if (!existingGlue) {
    const newGlue = await createGlue(glueName, deploymentParams, "deploy", { tags });
    if (!newGlue.pendingDeployment) {
      throw new Error("Failed to create glue");
    }
    newDeploymentId = newGlue.pendingDeployment.id;
    await kv.set(["glue-last-deployed-path", GLUE_API_SERVER, newGlue.id], absPath);
  } else {
    // If there's an existing glue, we want to warn the user that it will be
    // overwritten *unless* they have already deployed this file (identified by
    // absolute path) on their current machine to this glue before.
    const lookupResult = await kv.get<string>([
      "glue-last-deployed-path",
      GLUE_API_SERVER,
      existingGlue.id,
    ]);
    if (
      !lookupResult.value ||
      absPath.localeCompare(lookupResult.value, undefined, { sensitivity: "base" }) !== 0
    ) {
      unmountUI();
      console.warn(
        `Warning: You are deploying to an existing glue named %c${
          JSON.stringify(glueName)
        }%c which was created previously.\nThis deployment will overwrite the existing glue.`,
        "color: orange",
        "",
      );
      if (lookupResult.value != null) {
        console.warn(
          `\nThe previous deployment to this glue from this machine was made from the following path:\n - %c${lookupResult.value}\n`,
          "color: blue",
        );
      }
      const confirm = await Confirm.prompt({
        message: `Do you want to continue and overwrite this glue?`,
        default: false,
      });
      if (!confirm) {
        return;
      }
      updateUI({}); // Rerender the UI after unmounting
      await kv.set(["glue-last-deployed-path", GLUE_API_SERVER, existingGlue.id], absPath);
    }

    const newDeployment = await createDeployment(existingGlue.id, deploymentParams);
    if (tags.length) {
      const desiredTags = addTags(existingGlue.tags, tags);
      existingGlue = await updateGlue(existingGlue.id, { tags: desiredTags });
    }
    newDeploymentId = newDeployment.id;
  }

  const uploadingCodeDuration = performance.now() - duration;

  for await (const deployment of streamChangesTillDeploymentReady(newDeploymentId)) {
    // modify the uploadingCodeStep at the same time as we get the first deployment so it never
    // looks to the user like we're done prematurely
    updateUI({ deployment, uploadingCodeState: "success", uploadingCodeDuration });
  }
}
