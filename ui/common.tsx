import { Box, Newline, Text } from "ink";
import Spinner from "ink-spinner";
import Link from "ink-link";
import type {
  AccountInjectionDTO,
  AccountToSetup,
  BuildStepDTO,
  BuildStepName,
  SecretInjectionDTO,
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
  { triggers, accountInjections, secretInjections, accountsToSetup }: {
    triggers: TriggerDTO[];
    accountInjections: AccountInjectionDTO[];
    secretInjections: SecretInjectionDTO[];
    accountsToSetup: AccountToSetup[];
  },
) => {
  const secretsToSetup = secretInjections.filter((secretInjection) =>
    !secretInjection.secretId && secretInjection.secretSetupUrl
  );
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {accountsToSetup.length > 0 && (
        <Text>
          {accountsToSetup.length} account{accountsToSetup.length > 1 ? "s" : ""}{" "}
          need{accountsToSetup.length > 1 ? "" : "s"} authentication:
        </Text>
      )}
      {accountsToSetup.map((ats) => (
        <Box paddingLeft={2} key={ats.type + ":" + ats.selector}>
          <Text>
            {ats.type} {ats.selector ? `(${ats.selector})` : ""}:{" "}
            <Link url={ats.accountSetupUrl}>
              <Text bold>{ats.accountSetupUrl}</Text>
            </Link>
          </Text>
        </Box>
      ))}
      {secretsToSetup.length > 0 && (
        <Text>
          {secretsToSetup.length} secret{secretsToSetup.length > 1 ? "s" : ""}{" "}
          need{secretsToSetup.length > 1 ? "" : "s"} configuration:
        </Text>
      )}
      {secretsToSetup.map((secretInjection) => (
        <Box paddingLeft={2} key={secretInjection.id}>
          <Text>
            {secretInjection.name} ({secretInjection.label}):{" "}
            <Link url={secretInjection.secretSetupUrl!}>
              <Text bold>{secretInjection.secretSetupUrl}</Text>
            </Link>
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export const CompletedRegistrationList = (
  { triggers, accountInjections, secretInjections }: {
    triggers: TriggerDTO[];
    accountInjections: AccountInjectionDTO[];
    secretInjections: SecretInjectionDTO[];
  },
) => {
  const sortedTriggers = toSortedByTypeThenLabel(triggers);
  const sortedAccountInjections = toSortedByTypeThenLabel(accountInjections);
  const sortedSecretInjections = secretInjections.toSorted((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
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
      {sortedSecretInjections.length > 0 && <Text>Secrets:</Text>}
      {sortedSecretInjections.map((secretInjection) => (
        <Box paddingLeft={2} key={secretInjection.id}>
          <Text>
            {secretInjection.name}({secretInjection.description ?? secretInjection.label})
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
