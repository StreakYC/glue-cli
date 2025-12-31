import type { BuildStepDTO, DeploymentDTO, StepStatus } from "../backend.ts";
import React from "react";
import {
  BuildStepStatusRow,
  ClientStepRow,
  CompletedRegistrationList,
  RegistrationAccountSetupSection,
} from "./common.tsx";
import { Box, Text } from "ink";
import { Newline } from "ink";
import type { DebugMode, SetupReplayResult } from "../commands/dev.ts";

export type Step = {
  state: StepStatus;
  duration: number;
};

export type DevUIProps = {
  steps: {
    codeAnalysis?: Step;
    bootingCode: Step;
    discoveringTriggers: Step;
    gettingExecutionToReplay?: Step;
    registeringGlue?: Step;
    connectingToTunnel?: Step;
  };
  restarting: boolean;
  deployment?: DeploymentDTO;
  debugMode: DebugMode;
  setupReplayResult?: SetupReplayResult;
};

export const DevUI = (
  props: DevUIProps,
) => {
  const { deployment } = props;
  const steps = props.steps;
  const uiStepsDone = Object
    .keys(steps)
    .map((k) => k as keyof DevUIProps["steps"])
    .filter((k) => steps[k] !== undefined)
    .every((k) => steps[k]!.state === "success" || steps[k]!.state === "failure");

  let done = false;
  if (props.restarting) {
    done = uiStepsDone &&
      (props.deployment
        ? props.deployment.buildSteps.every((step: BuildStepDTO) => step.status === "success")
        : true);
  } else {
    done = uiStepsDone && props.deployment !== undefined &&
      props.deployment.buildSteps.every((step: BuildStepDTO) => step.status === "success");
  }

  const needsAccountSetup = deployment &&
    (deployment.triggers.some((t) => !!t.accountSetupUrl) ||
      deployment.accountInjections.some((a) => !!a.accountSetupUrl));

  return (
    <>
      {props.restarting && (
        <>
          <Newline />
          <Text>File changes detected, restarting glue...</Text>
        </>
      )}

      {steps.codeAnalysis && (
        <ClientStepRow
          stepState={steps.codeAnalysis.state}
          stepDuration={steps.codeAnalysis.duration}
          stepTitle="Analyzing code"
        />
      )}

      <ClientStepRow
        stepState={steps.bootingCode.state}
        stepDuration={steps.bootingCode.duration}
        stepTitle={`Booting code${
          props.debugMode === "inspect-wait" ? " and waiting for debugger to connect" : ""
        }`}
      />

      <ClientStepRow
        stepState={steps.discoveringTriggers.state}
        stepDuration={steps.discoveringTriggers.duration}
        stepTitle="Discovering triggers"
      />

      {steps.gettingExecutionToReplay && (
        <ClientStepRow
          stepState={steps.gettingExecutionToReplay.state}
          stepDuration={steps.gettingExecutionToReplay.duration}
          stepTitle="Getting execution to replay"
        />
      )}
      {props.setupReplayResult && <ReplayResultRow {...props.setupReplayResult} />}

      {steps.registeringGlue && (
        <ClientStepRow
          stepState={steps.registeringGlue.state}
          stepDuration={steps.registeringGlue.duration}
          stepTitle="Registering glue"
        />
      )}

      {deployment && deployment.buildSteps.map((step) => (
        <React.Fragment key={step.name}>
          <BuildStepStatusRow step={step} />
          {step.name === "registrationAuth" && step.status === "in_progress" && needsAccountSetup &&
            (
              <RegistrationAccountSetupSection
                triggers={deployment.triggers}
                accountInjections={deployment.accountInjections}
              />
            )}
          {step.name === "registrationSetup" && step.status === "success" && (
            <CompletedRegistrationList
              triggers={deployment.triggers}
              accountInjections={deployment.accountInjections}
            />
          )}
        </React.Fragment>
      ))}
      {deployment && steps.connectingToTunnel && (
        <ClientStepRow
          stepState={steps.connectingToTunnel.state}
          stepDuration={steps.connectingToTunnel.duration}
          stepTitle="Connecting to tunnel"
        />
      )}
      {done && (
        <>
          <Newline />
          <Text>Press:</Text>

          <Box paddingLeft={2}>
            <Text color="green">r</Text>
            <Text>- replay last event</Text>
          </Box>

          {props.setupReplayResult && props.setupReplayResult.execution &&
            props.setupReplayResult.compatible && (
            <Box paddingLeft={2}>
              <Text color="yellow">e</Text>
              <Text>- replay {props.setupReplayResult.executionId}</Text>
            </Box>
          )}

          <Box paddingLeft={2}>
            <Text color="blue">s</Text>
            <Text>- generate a sample event</Text>
          </Box>

          <Box paddingLeft={2}>
            <Text color="red">q</Text>
            <Text>- quit</Text>
          </Box>

          <Newline />
          <Text>Waiting for events...</Text>
        </>
      )}
    </>
  );
};

export function ReplayResultRow({ execution, compatible }: SetupReplayResult) {
  return (
    <>
      {!execution && <Text color="dim">⚠️ Could not find execution to replay</Text>}
      {execution && !compatible && (
        <Text color="dim">⚠️ Execution is not compatible with the current triggers</Text>
      )}
    </>
  );
}
