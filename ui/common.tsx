import { Box, Newline, Text } from "ink";
import Spinner from "ink-spinner";
import type {
  AccountInjectionDTO,
  AccountToSetup,
  BuildStepDTO,
  BuildStepName,
  StepStatus,
  TriggerDTO,
} from "../backend.ts";
import { toSortedByTypeThenLabel } from "./utils.ts";

export const BuildStepTitles: Record<BuildStepName, string> = {
  deployCode: "Booting code",
  createTriggers: "Creating triggers",
  createTunnel: "Creating local tunnel",
  registrationAuth: "Checking accounts needed",
  registrationSetup: "Setting up triggers",
};

export const BuildStepStatusRow = ({ step }: { step: BuildStepDTO }) => {
  const title = BuildStepTitles[step.name];
  if (step.status === "success") {
    return (
      <Text>
        <Text color="green">✔︎</Text> {title}
        {step.endTime && step.startTime && (
          <Text color="gray">{` (${Math.round(step.endTime - step.startTime)}ms)`}</Text>
        )}
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

// will use triggers and account injections later when we want to show more detailed info about the accounts needing auth
export const RegistrationAccountSetupSection = (
  // deno-lint-ignore no-unused-vars
  { triggers, accountInjections, accountsToSetup }: {
    triggers: TriggerDTO[];
    accountInjections: AccountInjectionDTO[];
    accountsToSetup: AccountToSetup[];
  },
) => {
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {accountsToSetup.length > 0 && (
        <Text>
          {accountsToSetup.length} account{accountsToSetup.length > 1 ? "s" : ""}{" "}
          needs authentication:
        </Text>
      )}
      {accountsToSetup.map((ats) => (
        <Box paddingLeft={2} key={ats.type}>
          <Text>
            {ats.type} {ats.selector ? `(${ats.selector})` : ""}:{" "}
            <Text bold>{ats.accountSetupUrl}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export const CompletedRegistrationList = (
  { triggers, accountInjections }: {
    triggers: TriggerDTO[];
    accountInjections: AccountInjectionDTO[];
  },
) => {
  const sortedTriggers = toSortedByTypeThenLabel(triggers);
  const sortedAccountInjections = toSortedByTypeThenLabel(accountInjections);
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {sortedTriggers.length > 0 && <Text>Triggers:</Text>}
      {sortedTriggers.map((t) => (
        <Box paddingLeft={2} key={t.id}>
          <Text>
            {t.type}({t.label}): <Text bold>{t.description}</Text>
          </Text>
        </Box>
      ))}
      {sortedAccountInjections.length > 0 && <Text>Credential fetchers:</Text>}
      {sortedAccountInjections.map((a) => (
        <Box paddingLeft={2} key={a.id}>
          <Text>
            {a.type}({a.description ?? a.label})
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export const ClientStepRow = (
  { stepState, stepDuration, stepTitle }: {
    stepState: StepStatus;
    stepDuration: number;
    stepTitle: string;
  },
) => {
  if (stepState === "not_started") {
    return <Text color="gray">○ {stepTitle}</Text>;
  } else if (stepState === "success") {
    return (
      <Text>
        <Text color="green">✔︎</Text> {stepTitle}{" "}
        <Text color="gray">{`(${Math.round(stepDuration)}ms)`}</Text>
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
