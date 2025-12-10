import {
  type AccountDTO,
  deleteAccount,
  getAccountById,
  getAccounts,
  stopGlue,
} from "../backend.ts";
import { Table } from "@cliffy/table";
import { green } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForAccount, displayNameForAccount } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { Confirm } from "@cliffy/prompt/confirm";

interface AccountsOptions {
  json?: boolean;
}

export const accounts = async (options: AccountsOptions) => {
  await checkForAuthCredsOtherwiseExit();

  if (options.json) {
    const accounts = await getAccounts();
    console.log(JSON.stringify(accounts, null, 2));
    return;
  } else {
    const accounts = await runStep("Loading accounts...", async () => {
      return await getAccounts();
    });

    if (accounts.length === 0) {
      console.log("No accounts found");
      return;
    }

    new Table()
      .header(["Account ID", "Type", "Label", "Name", "Scopes", "API Key", "Created At"])
      .body(
        accounts.map((account) => [
          account.id,
          account.type,
          account.selector,
          account.displayName,
          account.scopes?.join(", "),
          account.redactedApiKey,
          formatEpochMillis(account.createdAt),
        ]),
      )
      .padding(4)
      .render();
  }
};

export const deleteAccountCmd = async (_options: unknown, id?: string) => {
  await checkForAuthCredsOtherwiseExit();

  let accountToDelete: AccountDTO | undefined;

  if (!id && Deno.stdout.isTerminal()) {
    accountToDelete = await askUserForAccount();
  } else if (id) {
    accountToDelete = await runStep("Loading account...", async () => {
      return await getAccountById(id);
    });
  }

  if (!accountToDelete) {
    throw new Error("You must provide an account ID or select one in an interactive terminal");
  }

  if (accountToDelete.liveGlues.length > 0) {
    console.log("This account is being used by the following glues that need to be stopped first:");
    const glueNames = accountToDelete.liveGlues.map((glue) => `${green(glue.name)} (${glue.id})`)
      .join(",");
    console.log(glueNames);
    const confirm = await Confirm.prompt({
      message: `Stop these glues`,
      default: false,
    });
    if (!confirm) {
      return;
    }
    for (const glue of accountToDelete.liveGlues) {
      await runStep(`Stopping glue ${glue.name} (${glue.id})...`, async () => {
        await stopGlue(glue.id);
      });
    }
    console.log(`\n`);
  }
  const confirm = await Confirm.prompt({
    message: `Are you sure you want to delete the ${
      displayNameForAccount(accountToDelete)
    } account`,
    default: false,
  });

  if (confirm) {
    await runStep(`Deleting ${displayNameForAccount(accountToDelete)} account...`, async () => {
      await deleteAccount(accountToDelete.id);
    });
  }
};
