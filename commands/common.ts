import { type AccountDTO, getAccounts, getGlues, type GlueDTO } from "../backend.ts";
import { Checkbox } from "@cliffy/prompt/checkbox";
import { Select } from "@cliffy/prompt/select";
import { runStep } from "../ui/utils.ts";

export async function askUserForGlue(): Promise<GlueDTO | undefined> {
  const glues = await runStep("Loading glues...", () => getGlues());
  if (!glues.length) {
    return undefined;
  }
  return await Select.prompt({
    message: "Choose a glue",
    search: true,
    options: glues.map((glue) => ({ name: glue.name, value: glue })),
  });
}

export async function askUserForGlues(): Promise<GlueDTO[]> {
  const glues = await runStep("Loading glues...", () => getGlues());
  if (!glues.length) {
    return [];
  }
  return await Checkbox.prompt({
    message: "Choose one or more glues",
    options: glues.map((glue) => ({ name: glue.name, value: glue })),
  });
}

export async function askUserForAccount(): Promise<AccountDTO | undefined> {
  const accounts = await runStep("Loading accounts...", () => getAccounts());
  if (!accounts || accounts.length === 0) {
    return undefined;
  }
  return await Select.prompt({
    message: "Choose an account to delete",
    search: true,
    options: accounts.map((account) => ({
      name: account.type + " " + displayNameForAccount(account),
      value: account,
    })),
  });
}

export function displayNameForAccount(account: AccountDTO) {
  let retVal = account.selector;
  if (account.displayName) {
    retVal += ` (${account.displayName})`;
  } else if (account.redactedApiKey) {
    retVal += ` (${account.redactedApiKey})`;
  }
  return retVal;
}
