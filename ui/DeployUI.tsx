import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { BuildStepDTO, DeploymentDTO, TriggerDTO } from "../backend.ts";
import React from "react";

export type CodeAnalysisState = "checking" | "done";
export type ExistingGlueState = "not_started" | "checking" | "creatingNewGlue" | "createdNewGlue" | "usedExistingGlue";

export type DeployUIProps = {
  deployment?: DeploymentDTO;
  existingGlueState: ExistingGlueState;
  existingGlueDuration: number;
  codeAnalysisState: CodeAnalysisState;
  codeAnalysisDuration: number;
};

export const DeployUI = (
  { deployment, existingGlueState, existingGlueDuration, codeAnalysisState, codeAnalysisDuration }: DeployUIProps,
) => {
  return (
    <>
      <CodeAnalysisStateRow codeAnalysisState={codeAnalysisState} codeAnalysisDuration={codeAnalysisDuration} />
      <ExistingGlueStateRow existingGlueState={existingGlueState} existingGlueDuration={existingGlueDuration} />
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

const ExistingGlueStateRow = ({ existingGlueState, existingGlueDuration }: { existingGlueState: ExistingGlueState; existingGlueDuration: number }) => {
  if (existingGlueState === "not_started") {
    return <Text color="gray">○ Checking for existing glue</Text>;
  } else if (existingGlueState === "checking") {
    return (
      <Text>
        <Spinner type="dots" /> Checking for existing glue
      </Text>
    );
  } else if (existingGlueState === "creatingNewGlue") {
    return (
      <React.Fragment>
        <Text>
          <Text color="green">✔︎</Text> Checking for existing glue
        </Text>
        <Text>
          <Spinner type="dots" /> Creating new glue
        </Text>
      </React.Fragment>
    );
  } else if (existingGlueState === "createdNewGlue") {
    return (
      <React.Fragment>
        <Text>
          <Text color="green">✔︎</Text> Checking for existing glue
        </Text>
        <Text>
          <Text color="green">✔︎</Text> Creating new glue
        </Text>
      </React.Fragment>
    );
  } else if (existingGlueState === "usedExistingGlue") {
    return (
      <Text>
        <Text color="green">✔︎</Text> Checking for existing glue <Text color="gray">{`(${Math.round(existingGlueDuration)}ms)`}</Text>
      </Text>
    );
  }
};

const CodeAnalysisStateRow = ({ codeAnalysisState, codeAnalysisDuration }: { codeAnalysisState: CodeAnalysisState; codeAnalysisDuration: number }) => {
  if (codeAnalysisState === "checking") {
    return (
      <Text>
        <Spinner type="dots" />
        Analyzing code
      </Text>
    );
  } else if (codeAnalysisState === "done") {
    return (
      <Text>
        <Text color="green">✔︎</Text> Analyzing code <Text color="gray">{`(${Math.round(codeAnalysisDuration)}ms)`}</Text>
      </Text>
    );
  }
};
