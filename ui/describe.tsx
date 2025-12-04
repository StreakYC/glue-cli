import type { AccountDTO, DeploymentDTO, ExecutionDTO, GlueDTO } from "../backend.ts";
import React from "react";
import { Box, Newline, Text } from "ink";
import { BuildStepStatusRow, CompletedRegistrationList } from "./common.tsx";
import { formatEpochMillis } from "./utils.ts";

export const DescribeUI = ({ target, isWatching }: { target: React.ReactElement; isWatching: boolean }) => {
  return (
    <>
      {target}
      <Newline />
      {isWatching && <Text color="dim">Watching for changes (Ctrl+C to quit)...</Text>}
    </>
  );
};

export type DescribeDeploymentUIProps = {
  deployment: DeploymentDTO;
};

export const DescribeDeploymentUI = ({ deployment }: DescribeDeploymentUIProps) => {
  return (
    <>
      <Text>
        <Text bold>{deployment.id}</Text> <Text color="gray">(Glue: {deployment.glueId})</Text>
      </Text>
      <Text>
        Status: {renderDeploymentStatus(deployment.status)}
      </Text>
      <Text>
        Created: {new Date(deployment.createdAt).toLocaleString()}
      </Text>
      <Text>
        Updated: {new Date(deployment.updatedAt).toLocaleString()}
      </Text>

      {deployment.buildSteps.length > 0 && (
        <>
          <Newline />
          <Text>Build Steps:</Text>
          {deployment.buildSteps.map((step) => (
            <React.Fragment key={step.name}>
              <BuildStepStatusRow step={step} />
            </React.Fragment>
          ))}
        </>
      )}

      {(deployment.triggers.length > 0 || deployment.accountInjections.length > 0) && (
        <>
          <Newline />
          <Text>Triggers and credential fetchers:</Text>
          <CompletedRegistrationList triggers={deployment.triggers} accountInjections={deployment.accountInjections} />
        </>
      )}
    </>
  );
};

interface GlueAndDeployments {
  glue: GlueDTO;
  deployments: DeploymentDTO[];
}
export type DescribeGlueUIProps = { glueAndDeployments: GlueAndDeployments };

export const DescribeGlueUI = ({ glueAndDeployments }: DescribeGlueUIProps) => {
  const { glue, deployments } = glueAndDeployments;
  const totalSuccess = glue.executionSummary.totalCount - glue.executionSummary.totalErrorCount;
  const totalFail = glue.executionSummary.totalErrorCount;
  const currentSuccess = glue.executionSummary.currentDeploymentCount - glue.executionSummary.currentDeploymentErrorCount;
  const currentFail = glue.executionSummary.currentDeploymentErrorCount;
  const sortedDeployments = deployments.toSorted((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <Text>
        <Text bold>{glue.name}</Text> <Text color="gray">({glue.id})</Text>
      </Text>
      <Text>
        Status: <RunningStatus status={glue.currentDeployment?.status} />
      </Text>
      <Text>Created: {formatEpochMillis(glue.createdAt)}</Text>
      <Newline />
      <Text>
        Runs: <Text color="green">{totalSuccess}</Text> successful
        {totalFail > 0 && (
          <>
            , <Text color="red">{totalFail}</Text> failed
          </>
        )}
      </Text>
      <Text>
        Runs since last deployment: <Text color="green">{currentSuccess}</Text> successful
        {currentFail > 0 && (
          <>
            , <Text color="red">{currentFail}</Text> failed
          </>
        )}
      </Text>
      <Newline />
      <Text>Last run: {formatEpochMillis(glue.executionSummary.mostRecent)}</Text>
      {glue.currentDeployment && (
        <>
          <Text>Last deployed: {formatEpochMillis(glue.currentDeployment.createdAt)}</Text>
          {(glue.currentDeployment.triggers.length > 0 || glue.currentDeployment.accountInjections.length > 0) && (
            <>
              <Newline />
              <Text>Triggers and credential fetchers:</Text>
              <CompletedRegistrationList triggers={glue.currentDeployment.triggers} accountInjections={glue.currentDeployment.accountInjections} />
            </>
          )}
        </>
      )}
      {sortedDeployments.length > 0 && (
        <>
          <Newline />
          <Text>Deployments:</Text>
          <Box flexDirection="column" paddingLeft={2}>
            {sortedDeployments.map((deployment) => (
              <Box key={deployment.id} flexDirection="column" marginBottom={1}>
                <Text>
                  <Text bold>{deployment.id}</Text> ·{" "}
                  <DeploymentStatusTag status={deployment.status} isCurrent={deployment.id === glue.currentDeployment?.id} />
                </Text>
                <Text>
                  Created: {formatEpochMillis(deployment.createdAt)} · Triggers: {deployment.triggers.length}
                </Text>
                {deployment.buildSteps.length > 0 && (
                  <Box flexDirection="column" paddingLeft={2}>
                    <Text>Build steps:</Text>
                    {deployment.buildSteps.map((step) => <BuildStepStatusRow key={step.name} step={step} />)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
};

export type DescribeAccountUIProps = { account: AccountDTO };

export const DescribeAccountUI = ({ account }: DescribeAccountUIProps) => {
  return (
    <>
      <Text>
        ID: <Text bold>{account.id}</Text>
      </Text>
      <Text>Type: {account.type}</Text>
      <Text>Label: {account.selector}</Text>
      <Text>Created: {new Date(account.createdAt).toLocaleString()}</Text>
      {account.displayName && <Text>Name: {account.displayName}</Text>}
      {account.redactedApiKey && <Text>API Key: {account.redactedApiKey}</Text>}
      {account.scopes && account.scopes.length > 0 && <Text>Scopes: {account.scopes.join(", ")}</Text>}
      {account.liveGlues.length > 0 && (
        <>
          <Newline />
          <Text>Live Glues:</Text>
          <Box flexDirection="column" paddingLeft={2}>
            {account.liveGlues.map((glue) => (
              <Text key={glue.id}>
                <Text color="green">{glue.name}</Text>
                {glue.environment === "dev" && <Text color="yellow">[DEV]</Text>} <Text color="gray">({glue.id})</Text>
              </Text>
            ))}
          </Box>
        </>
      )}
    </>
  );
};

export type DescribeExecutionUIProps = { execution: ExecutionDTO };

export const DescribeExecutionUI = ({ execution }: DescribeExecutionUIProps) => {
  const completedAt = execution.endedAt ? new Date(execution.endedAt).toLocaleString() : "Not completed";
  const duration = execution.endedAt ? `${execution.endedAt - execution.startedAt}ms` : "Not completed";
  return (
    <>
      <Text bold>{execution.id}</Text>
      <Text>
        Trigger: {execution.trigger.type} ({execution.trigger.label})
        {execution.trigger.description ? `: ${execution.trigger.description}` : ""}
      </Text>
      <Text>
        Status: <ExecutionState state={execution.state} />
      </Text>
      <Text>Started: {new Date(execution.startedAt).toLocaleString()}</Text>
      <Text>Completed: {completedAt}</Text>
      <Text>Duration: {duration}</Text>
      {execution.logs.length > 0 && (
        <>
          <Newline />
          <Text>Logs:</Text>
          <Box flexDirection="column" paddingLeft={2}>
            {execution.logs.map((log, index) => (
              <Text key={`${log.timestamp}-${index}`}>
                <Text color={log.type === "stdout" ? "green" : "red"}>{new Date(log.timestamp).toLocaleString()}</Text> {log.text}
              </Text>
            ))}
          </Box>
        </>
      )}
      <Newline />
      <Text>Input Data:</Text>
      <Box flexDirection="column" paddingLeft={2}>
        <Text>{JSON.stringify(execution.inputData, null, 2)}</Text>
      </Box>
    </>
  );
};

function renderDeploymentStatus(status: string): React.ReactNode {
  switch (status) {
    case "pending":
      return <Text color="yellow">pending</Text>;
    case "committing":
      return <Text color="yellow">committing</Text>;
    case "success":
      return <Text color="green">success</Text>;
    case "failure":
      return <Text color="red">failure</Text>;
    case "cancelled":
      return <Text color="gray">cancelled</Text>;
    default:
      return <Text>{status}</Text>;
  }
}

const DeploymentStatusTag = ({ status, isCurrent }: { status: string; isCurrent: boolean }) => {
  if (isCurrent) {
    return <Text color="green">RUNNING</Text>;
  }
  switch (status) {
    case "pending":
      return <Text color="yellow">pending</Text>;
    case "committing":
      return <Text color="yellow">committing</Text>;
    case "success":
      return <Text color="cyan">success</Text>;
    case "failure":
      return <Text color="red">failure</Text>;
    case "cancelled":
      return <Text color="gray">cancelled</Text>;
    default:
      return <Text>{status}</Text>;
  }
};

const RunningStatus = ({ status }: { status?: string }) => {
  switch (status) {
    case "pending":
      return <Text color="yellow">BOOTING</Text>;
    case "committing":
      return <Text color="yellow">COMMITTING</Text>;
    case "success":
      return <Text color="green">RUNNING</Text>;
    case "failure":
      return <Text color="red">FAILED</Text>;
    case "cancelled":
      return <Text color="gray">CANCELLED</Text>;
    default:
      return <Text color="gray">STOPPED</Text>;
  }
};

const ExecutionState = ({ state }: { state: string }) => {
  switch (state) {
    case "success":
      return <Text color="green">{state.toUpperCase()}</Text>;
    case "failure":
      return <Text color="red">{state.toUpperCase()}</Text>;
    case "running":
      return <Text color="cyan">{state.toUpperCase()}</Text>;
    default:
      return <Text color="gray">{state.toUpperCase()}</Text>;
  }
};
