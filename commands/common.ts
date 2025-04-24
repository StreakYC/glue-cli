import { type AccountDTO, getAccounts, getGlues, type GlueDTO } from "../backend.ts";
import { Select } from "@cliffy/prompt/select";
import { runStep } from "../ui/utils.ts";

export async function askUserForGlue(): Promise<GlueDTO | undefined> {
  const glues = await runStep("Loading glues...", () => getGlues("deploy"));
  if (!glues) {
    return undefined;
  }
  return await Select.prompt({
    message: "Choose a glue",
    search: true,
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
      name: displayNameForAccount(account),
      value: account,
    })),
  });
}

export function displayNameForAccount(account: AccountDTO) {
  return `${account.type} (${account.name ?? account.emailAddress ?? account.username ?? account.externalId})`;
}
