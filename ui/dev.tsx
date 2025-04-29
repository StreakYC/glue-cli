import type { BuildStepDTO, DeploymentDTO, StepStatus } from "../backend.ts";
import React from "react";
import { AuthTriggerList, BuildStepStatusRow, ClientStepRow, SetupTriggerList } from "./common.tsx";
import { Text } from "ink";
import { Newline } from "ink";

export type Step = {
  state: StepStatus;
  duration: number;
};

export type DevUIProps = {
  steps: {
    codeAnalysis?: Step;
    bootingCode: Step;
    discoveringTriggers: Step;
    registeringGlue?: Step;
    connectingToTunnel?: Step;
  };
  restarting: boolean;
  deployment?: DeploymentDTO;
};

export const DevUI = (
  props: DevUIProps,
) => {
  const steps = props.steps;
  const uiStepsDone = Object
    .keys(steps)
    .map((k) => k as keyof DevUIProps["steps"])
    .filter((k) => steps[k] !== undefined)
    .every((k) => steps[k]!.state === "success");

  let done = false;
  if (props.restarting) {
    done = uiStepsDone && (props.deployment ? props.deployment.buildSteps.every((step: BuildStepDTO) => step.status === "success") : true);
  } else {
    done = uiStepsDone && props.deployment !== undefined && props.deployment.buildSteps.every((step: BuildStepDTO) => step.status === "success");
  }

  return (
    <>
      {props.restarting && (
        <>
          <Newline />
          <Text>File changes detected, restarting glue...</Text>
        </>
      )}
      {steps.codeAnalysis && <ClientStepRow stepState={steps.codeAnalysis.state} stepDuration={steps.codeAnalysis.duration} stepTitle="Analyzing code" />}
      <ClientStepRow stepState={steps.bootingCode.state} stepDuration={steps.bootingCode.duration} stepTitle="Booting code" />
      <ClientStepRow stepState={steps.discoveringTriggers.state} stepDuration={steps.discoveringTriggers.duration} stepTitle="Discovering triggers" />
      {steps.registeringGlue && (
        <ClientStepRow stepState={steps.registeringGlue.state} stepDuration={steps.registeringGlue.duration} stepTitle="Registering glue" />
      )}
      {props.deployment && props.deployment.buildSteps.map((step: BuildStepDTO) => (
        <React.Fragment key={step.name}>
          <BuildStepStatusRow step={step} />
          {step.name === "triggerAuth" && step.status === "in_progress" && props.deployment?.triggers.some((t) => !!t.accountSetupUrl) && (
            <AuthTriggerList triggers={props.deployment?.triggers} />
          )}
          {step.name === "triggerSetup" && step.status === "success" && props.deployment && <SetupTriggerList triggers={props.deployment.triggers} />}
        </React.Fragment>
      ))}
      {props.deployment && steps.connectingToTunnel && (
        <ClientStepRow
          stepState={steps.connectingToTunnel.state}
          stepDuration={steps.connectingToTunnel.duration}
          stepTitle="Connecting to tunnel"
        />
      )}
      {done && (
        <>
          <Newline />
          <Text>
            Waiting for events (or press 'r' to replay last event)...
          </Text>
        </>
      )}
    </>
  );
};
