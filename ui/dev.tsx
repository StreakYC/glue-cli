import type { BuildStepDTO, DeploymentDTO, StepStatus } from "../backend.ts";
import React from "react";
import { AuthTriggerList, BuildStepStatusRow, ClientStepRow, SetupTriggerList } from "./common.tsx";
import { Text } from "ink";
import { Newline } from "ink";

export type DevUIProps = {
  codeAnalysisState: StepStatus;
  codeAnalysisDuration: number;
  bootingCodeState: StepStatus;
  bootingCodeDuration: number;
  creatingTriggersState: StepStatus;
  creatingTriggersDuration: number;
  registeringGlueState: StepStatus;
  registeringGlueDuration: number;
  connectingToTunnelState: StepStatus;
  connectingToTunnelDuration: number;
  deployment?: DeploymentDTO;
};

export const DevUI = (
  props: DevUIProps,
) => {
  const done = props.deployment && props.deployment.buildSteps.every((step: BuildStepDTO) => step.status === "success") &&
    props.codeAnalysisState === "success" && props.bootingCodeState === "success" && props.creatingTriggersState === "success" &&
    props.registeringGlueState === "success";

  return (
    <>
      <ClientStepRow stepState={props.codeAnalysisState} stepDuration={props.codeAnalysisDuration} stepTitle="Analyzing code" />
      <ClientStepRow stepState={props.bootingCodeState} stepDuration={props.bootingCodeDuration} stepTitle="Booting code" />
      <ClientStepRow stepState={props.creatingTriggersState} stepDuration={props.creatingTriggersDuration} stepTitle="Creating triggers" />
      <ClientStepRow stepState={props.registeringGlueState} stepDuration={props.registeringGlueDuration} stepTitle="Registering glue" />
      {props.deployment && props.deployment.buildSteps.map((step: BuildStepDTO) => (
        <React.Fragment key={step.name}>
          <BuildStepStatusRow step={step} />
          {step.name === "triggerAuth" && props.deployment?.triggers.some((t) => !!t.accountSetupUrl) && (
            <AuthTriggerList triggers={props.deployment?.triggers} />
          )}
          {step.name === "triggerSetup" && step.status === "success" && props.deployment && <SetupTriggerList triggers={props.deployment.triggers} />}
        </React.Fragment>
      ))}
      {props.deployment && (
        <ClientStepRow stepState={props.connectingToTunnelState} stepDuration={props.connectingToTunnelDuration} stepTitle="Connecting to tunnel" />
      )}
      {done && (
        <>
          <Newline />
          <Text>
            Waiting for events...
          </Text>
        </>
      )}
    </>
  );
};
