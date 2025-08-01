import { Box, Newline, Text } from "ink";
import Spinner from "ink-spinner";
import type { AccountInjectionDTO, BuildStepDTO, StepStatus, TriggerDTO } from "../backend.ts";

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
        <Newline />
        {step.text && <Text color="red">{step.text}</Text>}
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

export const RegistrationAccountSetupSection = ({ triggers, accountInjections }: { triggers: TriggerDTO[]; accountInjections: AccountInjectionDTO[] }) => {
  const sortedRegistrations = [...triggers, ...accountInjections]
    .filter((t) => !!t.accountSetupUrl)
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      <Text backgroundColor="red" color="white">Need authentication:</Text>
      {sortedRegistrations.map((t) => (
        <Text key={t.id}>
          {t.type}({t.label}): <Text bold>{t.accountSetupUrl}</Text>
        </Text>
      ))}
    </Box>
  );
};

export const CompletedRegistrationList = ({ triggers, accountInjections }: { triggers: TriggerDTO[]; accountInjections: AccountInjectionDTO[] }) => {
  const sortedRegistrations = [...triggers, ...accountInjections]
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {sortedRegistrations.map((t) => (
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
