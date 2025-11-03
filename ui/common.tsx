import { Box, Newline, Text } from "ink";
import Spinner from "ink-spinner";
import type { AccountInjectionDTO, BuildStepDTO, BuildStepName, StepStatus, TriggerDTO } from "../backend.ts";

export const BuildStepTitles: Record<BuildStepName, string> = {
  deployCode: "Booting code",
  createTriggers: "Creating triggers",
  createTunnel: "Creating local tunnel",
  registrationAuth: "Authenticating triggers & injections",
  registrationSetup: "Setting up triggers & injections",
};

export const BuildStepStatusRow = ({ step }: { step: BuildStepDTO }) => {
  const title = BuildStepTitles[step.name];
  if (step.status === "success") {
    return (
      <Text>
        <Text color="green">✔︎</Text> {title}
        {step.endTime && step.startTime && <Text color="gray">{` (${Math.round(step.endTime - step.startTime)}ms)`}</Text>}
      </Text>
    );
  } else if (step.status === "failure") {
    return (
      <Text>
        <Text color="red">✗</Text> {title}
        <Newline />
        {step.text && <Text color="red">{step.text}</Text>}
      </Text>
    );
  } else if (step.status === "in_progress") {
    return (
      <Text>
        <Spinner type="dots" /> {title}
      </Text>
    );
  } else if (step.status === "not_started") {
    return <Text color="gray">○ {title}</Text>;
  } else if (step.status === "skipped") {
    return <Text color="gray">◉ {title}</Text>;
  }
};

export const RegistrationAccountSetupSection = ({ triggers, accountInjections }: { triggers: TriggerDTO[]; accountInjections: AccountInjectionDTO[] }) => {
  const sortedTriggers = triggers
    .filter((t) => !!t.accountSetupUrl)
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const sortedAccountInjections = accountInjections
    .filter((a) => !!a.accountSetupUrl)
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {sortedTriggers.length > 0 && <Text>Triggers needing authentication:</Text>}
      {sortedTriggers.map((t) => (
        <Box paddingLeft={2}>
          <Text key={t.id}>
            {t.type}({t.label}): <Text bold>{t.accountSetupUrl}</Text>
          </Text>
        </Box>
      ))}
      {sortedAccountInjections.length > 0 && <Text>Account injections needing authentication:</Text>}
      {sortedAccountInjections.map((a) => (
        <Box paddingLeft={2}>
          <Text key={a.id}>
            {a.type}({a.label}): <Text bold>{a.accountSetupUrl}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export const CompletedRegistrationList = ({ triggers, accountInjections }: { triggers: TriggerDTO[]; accountInjections: AccountInjectionDTO[] }) => {
  const sortedTriggers = triggers
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const sortedAccountInjections = accountInjections
    .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {sortedTriggers.length > 0 && <Text>Triggers:</Text>}
      {sortedTriggers.map((t) => (
        <Box paddingLeft={2}>
          <Text key={t.id}>
            {t.type}({t.label}): <Text bold>{t.description}</Text>
          </Text>
        </Box>
      ))}
      {sortedAccountInjections.length > 0 && <Text>Account injections:</Text>}
      {sortedAccountInjections.map((a) => (
        <Box paddingLeft={2}>
          <Text key={a.id}>
            {a.type}({a.label}): <Text bold>{a.description}</Text>
          </Text>
        </Box>
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
