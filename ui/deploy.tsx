import type { BuildStepDTO, DeploymentDTO, StepStatus } from "../backend.ts";
import React from "react";
import {
  BuildStepStatusRow,
  ClientStepRow,
  CompletedRegistrationList,
  RegistrationAccountSetupSection,
} from "./common.tsx";
import { Newline, Text } from "ink";

export type DeployUIProps = {
  codeAnalysisState: StepStatus;
  codeAnalysisDuration: number;
  uploadingCodeState: StepStatus;
  uploadingCodeDuration: number;
  deployment?: DeploymentDTO;
  glueName: string;
};

export const DeployUI = (
  {
    deployment,
    codeAnalysisState,
    codeAnalysisDuration,
    uploadingCodeState,
    uploadingCodeDuration,
    glueName,
  }: DeployUIProps,
) => {
  const done = deployment && deployment.buildSteps.every((step) => step.status === "success");
  const needsRegistrationSetup = deployment &&
    (deployment.accountsToSetup.length > 0 ||
      deployment.secretInjections.some((secretInjection) =>
        !secretInjection.secretId && secretInjection.secretSetupUrl != null
      ));
  return (
    <>
      <ClientStepRow
        stepState={codeAnalysisState}
        stepDuration={codeAnalysisDuration}
        stepTitle="Analyzing code"
      />
      <ClientStepRow
        stepState={uploadingCodeState}
        stepDuration={uploadingCodeDuration}
        stepTitle="Uploading code"
      />
      {deployment &&
        deployment.buildSteps.map((step: BuildStepDTO) => (
          <React.Fragment key={step.name}>
            <BuildStepStatusRow step={step} />
            {step.name === "registrationAuth" && step.status === "in_progress" &&
              needsRegistrationSetup && (
              <RegistrationAccountSetupSection
                triggers={deployment.triggers}
                accountInjections={deployment.accountInjections}
                secretInjections={deployment.secretInjections}
                accountsToSetup={deployment.accountsToSetup}
              />
            )}
            {step.name === "registrationSetup" && step.status === "success" && (
              <CompletedRegistrationList
                triggers={deployment.triggers}
                accountInjections={deployment.accountInjections}
                secretInjections={deployment.secretInjections}
              />
            )}
          </React.Fragment>
        ))}
      {done && (
        <Text>
          <Newline />
          <Text>🎉 Successfully deployed your Glue</Text>
          <Newline />
          <Text color="dim">
            Try `glue describe` to see summary info or `glue logs{" "}
            {glueName}` to watch for executions
          </Text>
        </Text>
      )}
    </>
  );
};
