import { Box, Newline, Text } from "ink";
import Spinner from "ink-spinner";
import Link from "ink-link";
import { Select } from "@inkjs/ui";
import { useRef, useState } from "react";
import { open } from "@opensrc/deno-open";
import type {
  AccountInjectionDTO,
  AccountSlimDTO,
  BuildStepDTO,
  BuildStepName,
  DeploymentDTO,
  RegistrationGroupToSetup,
  SecretInjectionDTO,
  StepStatus,
  TriggerDTO,
} from "../backend.ts";
import { associateDeploymentAccount } from "../backend.ts";
import { toSortedByTypeThenLabel } from "./utils.ts";
import { prettyLabels } from "../lib/prettyLabels.ts";

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
    if (step.name === "registrationAuth") {
      // Show a simple static indicator instead of a spinner for this step
      // because the server will not make progress on this step automatically;
      // the user must take action to complete it, and a spinner would be
      // misleading and distracting.
      return (
        <Text>
          ○ {title}
        </Text>
      );
    }
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
  { triggers, accountInjections, secretInjections, registrationGroupsToSetup }: {
    triggers: TriggerDTO[];
    accountInjections: AccountInjectionDTO[];
    secretInjections: SecretInjectionDTO[];
    registrationGroupsToSetup: RegistrationGroupToSetup[];
  },
) => {
  const secretsToSetup = secretInjections.filter((
    secretInjection,
  ): secretInjection is SecretInjectionDTO & { secretSetupUrl: string } =>
    !secretInjection.secretId && secretInjection.secretSetupUrl != null
  );
  return (
    <Box paddingLeft={4} display="flex" flexDirection="column" gap={0}>
      {registrationGroupsToSetup.length > 0 && (
        <Text>
          {registrationGroupsToSetup.length}{" "}
          account{registrationGroupsToSetup.length === 1 ? "" : "s"}{" "}
          need{registrationGroupsToSetup.length === 1 ? "s" : ""} authentication:
        </Text>
      )}
      {registrationGroupsToSetup.map((ats) => (
        <Box paddingLeft={2} key={JSON.stringify([ats.type, ats.accountSelector])}>
          <Text>
            {ats.type} {ats.accountSelector ? `(${prettyLabels(ats.accountSelector)})` : ""}
          </Text>
        </Box>
      ))}
      {secretsToSetup.length > 0 && (
        <Text>
          {secretsToSetup.length} secret{secretsToSetup.length === 1 ? "" : "s"}{" "}
          need{secretsToSetup.length === 1 ? "s" : ""} configuration:
        </Text>
      )}
      {secretsToSetup.map((secretInjection) => (
        <Text key={secretInjection.id}>
          {secretInjection.name} ({secretInjection.label}):<Newline />
          <Link url={secretInjection.secretSetupUrl} fallback={false}>
            <Text bold>{secretInjection.secretSetupUrl}</Text>
          </Link>
        </Text>
      ))}
    </Box>
  );
};

export function AccountPickerSection({ deployment }: { deployment: DeploymentDTO }) {
  const accountPickerNeeded = deployment.buildSteps.some((step) =>
    step.name === "registrationAuth" && step.status === "in_progress"
  );
  const registrationGroup = deployment.registrationGroupsToSetup[0];
  if (!accountPickerNeeded || !registrationGroup) {
    return null;
  }

  const key = JSON.stringify([registrationGroup.type, registrationGroup.accountSelector]);
  return (
    <AccountPicker
      key={key}
      deploymentId={deployment.id}
      registrationGroup={registrationGroup}
      compatibleAccounts={deployment.compatibleAccounts}
    />
  );
}

function AccountPicker(
  { deploymentId, registrationGroup, compatibleAccounts }: {
    deploymentId: string;
    registrationGroup: RegistrationGroupToSetup;
    compatibleAccounts: AccountSlimDTO[];
  },
) {
  const [associating, setAssociating] = useState(false);
  const [setupUrl, setSetupUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const accountsById = new Map(compatibleAccounts.map((account) => [account.id, account]));
  const usableAccounts = registrationGroup.compatibleAccountIds.filter((candidate) =>
    !candidate.missingScopes?.length && accountsById.has(candidate.id)
  );
  const accountsNeedingScopes = registrationGroup.compatibleAccountIds.filter((candidate) =>
    candidate.missingScopes?.length && candidate.accountSetupUrl && accountsById.has(candidate.id)
  );

  const groupDisplayName = accountTypeDisplayName(registrationGroup.type) +
    (registrationGroup.accountSelector
      ? ` (${prettyLabels(registrationGroup.accountSelector)})`
      : "");
  const setupUrls = new Map(
    accountsNeedingScopes.map((candidate) => [`setup:${candidate.id}`, candidate.accountSetupUrl!]),
  );

  const lastPickedValueRef = useRef<string>(undefined);

  return (
    <Box flexDirection="column">
      <Text>Choose {groupDisplayName} account:</Text>
      <Select
        isDisabled={associating || setupUrl !== undefined}
        options={[
          ...usableAccounts.map((candidate) => ({
            label: accountDisplayName(accountsById.get(candidate.id)!),
            value: `account:${candidate.id}`,
          })),
          ...accountsNeedingScopes.map((candidate) => ({
            label: `${
              accountDisplayName(accountsById.get(candidate.id)!)
            } (additional permissions required)`,
            value: `setup:${candidate.id}`,
          })),
          { label: "Add new account", value: "add" },
        ]}
        onChange={async (value) => {
          // work around https://github.com/vadimdemedes/ink-ui/issues/26
          if (value === lastPickedValueRef.current) {
            return;
          }
          lastPickedValueRef.current = value;

          setError(undefined);
          const selectedSetupUrl = value === "add"
            ? registrationGroup.accountSetupUrl
            : setupUrls.get(value);
          if (selectedSetupUrl) {
            setSetupUrl(selectedSetupUrl);
            try {
              await open(selectedSetupUrl);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
            }
            return;
          }

          const accountId = value.slice("account:".length);
          setAssociating(true);
          try {
            await associateDeploymentAccount(deploymentId, {
              type: registrationGroup.type,
              accountSelector: registrationGroup.accountSelector,
              accountId,
            });
          } catch (caught) {
            setAssociating(false);
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
      />
      {associating && <Text color="gray">Associating account...</Text>}
      {setupUrl && (
        <Text>
          Complete account setup in your browser:<Newline />
          <Link url={setupUrl} fallback={false}>
            <Text bold>{setupUrl}</Text>
          </Link>
        </Text>
      )}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

/**
 * Returns a human-readable display name for the account type. Capitalizes the
 * type for display purposes.
 */
function accountTypeDisplayName(accountType: string): string {
  return accountType.charAt(0).toUpperCase() + accountType.slice(1);
}

function accountDisplayName(account: AccountSlimDTO): string {
  let displayName = `${accountTypeDisplayName(account.type)} {${prettyLabels(account.labels)}}`;
  if (account.redactedApiKey) {
    displayName += ` (${account.redactedApiKey})`;
  }
  return displayName;
}

export const CompletedRegistrationListOld = (
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
            {t.type}({t.label}): <Text bold>{t.description}</Text>{" "}
            <Text color="gray">({t.id})</Text>
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
