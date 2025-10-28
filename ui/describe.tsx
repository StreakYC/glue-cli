import type { DeploymentDTO } from "../backend.ts";
import React from "react";
import { BuildStepStatusRow, CompletedRegistrationList } from "./common.tsx";
import { Newline, Text } from "ink";

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
          <Text>Triggers and account injections:</Text>
          <CompletedRegistrationList triggers={deployment.triggers} accountInjections={deployment.accountInjections} />
        </>
      )}
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
