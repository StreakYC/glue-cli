import { type AccountDTO, deleteAccount, type DeleteAccountErrorResponse, getAccountById, getAccounts, stopGlue } from "../backend.ts";
import { Table } from "@cliffy/table";
import { green, red, yellow } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForAccount } from "./common.ts";
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

    const accountsWithGlueCount = await Promise.all(
      accounts.map(async (account) => {
        try {
          const _result = await deleteAccount(account.id);
          return { ...account, liveGluesCount: 0 };
        } catch (error) {
          if (error && typeof error === "object" && "gluesNeedingStopping" in error) {
            const errorResponse = error as DeleteAccountErrorResponse;
            return { ...account, liveGluesCount: errorResponse.gluesNeedingStopping.length };
          }
          return { ...account, liveGluesCount: "Unknown" };
        }
      }),
    );

    new Table()
      .header(["ID", "Name", "Type", "Live Glues", "Created At"])
      .body(
        accountsWithGlueCount.map((account) => [
          account.id,
          account.name,
          account.type,
          account.liveGluesCount,
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

  if (id) {
    accountToDelete = await runStep(`Loading account ${id}...`, async () => {
      return await getAccountById(id);
    });
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

  await deleteAccountWithRetry(accountToDelete);
};

async function deleteAccountWithRetry(account: AccountDTO): Promise<void> {
  while (true) {
    try {
      const _result = await runStep(`Deleting account ${account.name}...`, async () => {
        return await deleteAccount(account.id);
      });

      console.log(green(`Successfully deleted account ${account.name}`));
      return;
    } catch (error) {
      if (error && typeof error === "object" && "gluesNeedingStopping" in error) {
        const errorResponse = error as DeleteAccountErrorResponse;
        console.log(yellow(`Cannot delete account because it is being used by ${errorResponse.gluesNeedingStopping.length} glue(s).`));

        if (!Deno.stdout.isTerminal()) {
          throw new Error("Cannot delete account with live glues in non-interactive mode");
        }

        const shouldStop = await Confirm.prompt({
          message: "Would you like to stop these glues and try again?",
          default: false,
        });

        if (!shouldStop) {
          console.log("Account deletion cancelled.");
          return;
        }

        for (const glue of errorResponse.gluesNeedingStopping) {
          await runStep(`Stopping glue ${glue.name} (${glue.id})...`, async () => {
            await stopGlue(glue.id);
          });
          console.log(green(`Stopped glue ${glue.name}`));
        }

        console.log("All glues stopped. Retrying account deletion...");
      } else if (error instanceof Error) {
        console.error(red(`Error deleting account: ${error.message}`));
        return;
      } else {
        console.error(red("Unknown error occurred while deleting account"));
        return;
      }
    }
  }
}
