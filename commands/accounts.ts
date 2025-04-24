import { getAccounts, deleteAccount, type AccountDTO } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForAccount } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";

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
      .header(["ID", "Name", "Type", "Created At"])
      .body(
        accounts.map((account) => [
          account.id,
          account.name,
          account.type,
          formatEpochMillis(account.createdAt),
        ]),
      )
      .padding(4)
      .render();
  }
};

export const deleteCmd = async (_options: unknown, id?: string) => {
  await checkForAuthCredsOtherwiseExit();
  
  let accountToDelete: AccountDTO | undefined;
  
  if (id) {
    const accounts = await getAccounts();
    accountToDelete = accounts.find(account => account.id === id);
    if (!accountToDelete) {
      throw new Error(`Account with id ${id} not found`);
    }
  } else if (Deno.stdout.isTerminal()) {
    accountToDelete = await askUserForAccount();
  } else {
    throw new Error("You must provide an account ID when not running in a terminal");
  }
  
  if (!accountToDelete) {
    throw new Error("No account selected for deletion");
  }
  
  await runStep(`Deleting account ${accountToDelete.name}...`, async () => {
    await deleteAccount(accountToDelete!.id);
  });
  
  console.log(green(`Successfully deleted account ${accountToDelete.name}`));
};
