import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { BuildStepDTO, DeploymentDTO, StepStatus, TriggerDTO } from "../backend.ts";
import React from "react";

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
  return (
    <>
      <ClientStepRow stepState={codeAnalysisState} stepDuration={codeAnalysisDuration} stepTitle="Analyzing code" />
      <ClientStepRow stepState={uploadingCodeState} stepDuration={uploadingCodeDuration} stepTitle="Uploading code" />
      {deployment && deployment.buildSteps.map((step: BuildStepDTO) => (
        <React.Fragment key={step.name}>
          <BuildStepStatusRow step={step} />
          {step.name === "triggerAuth" && deployment.triggers.some((t) => !!t.accountSetupUrl) && <AuthTriggerList triggers={deployment.triggers} />}
          {step.name === "triggerSetup" && step.status === "success" && deployment.triggers.some((t) => !!t.routingId) && (
            <SetupTriggerList triggers={deployment.triggers} />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

const BuildStepStatusRow = ({ step }: { step: BuildStepDTO }) => {
  if (step.status === "success") {
    return (
      <Text>
        <Text color="green">✔︎</Text> {step.title}
        {step.endTime && step.startTime && <Text color="gray">{` (${Math.round(step.endTime - step.startTime)}ms)`}</Text>}
      </Text>
    );
  } else if (step.status === "failure") {
    return (
      <Text>
        <Text color="red">✗</Text> {step.title}
      </Text>
    );
  } else if (step.status === "in_progress") {
    return (
      <Text>
        <Spinner type="dots" /> {step.title}
      </Text>
    );
  } else if (step.status === "not_started") {
    return <Text color="gray">○ {step.title}</Text>;
  } else if (step.status === "skipped") {
    return <Text color="gray">◉ {step.title}</Text>;
  }
};

const AuthTriggerList = ({ triggers }: { triggers: TriggerDTO[] }) => {
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      <Text backgroundColor="red" color="white">Need authentication:</Text>
      {triggers.filter((t) => !!t.accountSetupUrl).map((t) => (
        <Text key={t.id}>
          {t.type}: <Text bold>{t.accountSetupUrl}</Text>
        </Text>
      ))}
    </Box>
  );
};

const SetupTriggerList = ({ triggers }: { triggers: TriggerDTO[] }) => {
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {triggers.filter((t) => !!t.routingId).map((t) => (
        <Text key={t.id}>
          {t.type}({t.label}): <Text bold>{t.description}</Text>
        </Text>
      ))}
    </Box>
  );
};

const ClientStepRow = ({ stepState, stepDuration, stepTitle }: { stepState: StepStatus; stepDuration: number; stepTitle: string }) => {
  if (stepState === "not_started") {
    return <Text color="gray">○ {stepTitle}</Text>;
  } else if (stepState === "success") {
    return (
      <Text>
        <Text color="green">✔︎</Text> {stepTitle} <Text color="gray">{`(${Math.round(stepDuration)}ms)`}</Text>
      </Text>
    );
  } else if (stepState === "failure") {
    return (
      <Text>
        <Text color="red">✗</Text> {stepTitle}
      </Text>
    );
  } else if (stepState === "in_progress") {
    return (
      <Text>
        <Spinner type="dots" /> {stepTitle}
      </Text>
    );
  } else if (stepState === "skipped") {
    return <Text color="gray">◉ {stepTitle}</Text>;
  }
};
