import type { BuildStepDTO, DeploymentDTO, StepStatus } from "../backend.ts";
import React from "react";
import { AuthTriggerList, BuildStepStatusRow, ClientStepRow, SetupTriggerList } from "./common.tsx";
import { Newline, Text } from "ink";

export type DeployUIProps = {
  codeAnalysisState: StepStatus;
  codeAnalysisDuration: number;
  uploadingCodeState: StepStatus;
  uploadingCodeDuration: number;
  deployment?: DeploymentDTO;
};

export const DeployUI = (
  { deployment, codeAnalysisState, codeAnalysisDuration, uploadingCodeState, uploadingCodeDuration }: DeployUIProps,
) => {
  const done = deployment && deployment.buildSteps.every((step) => step.status === "success");
  return (
    <>
      <ClientStepRow stepState={codeAnalysisState} stepDuration={codeAnalysisDuration} stepTitle="Analyzing code" />
      <ClientStepRow stepState={uploadingCodeState} stepDuration={uploadingCodeDuration} stepTitle="Uploading code" />
      {deployment && deployment.buildSteps.map((step: BuildStepDTO) => (
        <React.Fragment key={step.name}>
          <BuildStepStatusRow step={step} />
          {step.name === "triggerAuth" && step.status === "in_progress" && deployment.triggers.some((t) => !!t.accountSetupUrl) && (
            <AuthTriggerList triggers={deployment.triggers} />
          )}
          {step.name === "triggerSetup" && step.status === "success" && <SetupTriggerList triggers={deployment.triggers} />}
        </React.Fragment>
      ))}
      {done && (
        <Text>
          <Newline />
          <Text>Successfully deployed your Glue 🎉</Text>
          <Newline />
          <Text color="dim">
            Try `glue describe` to see summary info or `glue tail` to watch for executions
          </Text>
        </Text>
      )}
    </>
  );
};
