import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { BuildStepDTO, StepStatus, TriggerDTO } from "../backend.ts";

export const BuildStepStatusRow = ({ step }: { step: BuildStepDTO }) => {
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

export const AuthTriggerList = ({ triggers }: { triggers: TriggerDTO[] }) => {
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      <Text backgroundColor="red" color="white">Need authentication:</Text>
      {triggers.sort((a, b) => a.label.localeCompare(b.label)).filter((t) => !!t.accountSetupUrl).map((t) => (
        <Text key={t.id}>
          {t.type}: <Text bold>{t.accountSetupUrl}</Text>
        </Text>
      ))}
    </Box>
  );
};

export const SetupTriggerList = ({ triggers }: { triggers: TriggerDTO[] }) => {
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {triggers.sort((a, b) => a.label.localeCompare(b.label)).filter((t) => !!t.routingId).map((t) => (
        <Text key={t.id}>
          {t.type}({t.label}): <Text bold>{t.description}</Text>
        </Text>
      ))}
    </Box>
  );
};

export const ClientStepRow = ({ stepState, stepDuration, stepTitle }: { stepState: StepStatus; stepDuration: number; stepTitle: string }) => {
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
