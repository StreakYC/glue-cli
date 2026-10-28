import { UserFacingError } from "../lib/UserFacingError.ts";
import {
  type AccountDTO,
  deleteAccount,
  getAccountById,
  getAccounts,
  getLoggedInUser,
  type GlueDTO,
  leaseAccount,
  stopGlue,
  unleaseAccount,
} from "../backend.ts";
import { Column, Table } from "@cliffy/table";
import { bold, dim, green } from "@std/fmt/colors";
import { formatEpochMillis } from "../ui/utils.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForAccount, displayNameForAccount } from "./common.ts";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { Confirm } from "@cliffy/prompt/confirm";
import { prettyLabelsColoredForTables } from "../lib/prettyLabels.ts";
import {
  describeWorkspace,
  getMyWorkspaces,
  pickWorkspace,
  referencedWorkspaces,
  type WorkspaceOptions,
} from "../lib/workspaces.ts";

interface AccountsOptions extends WorkspaceOptions {
  json?: boolean;
}

/**
 * Lists the user's own accounts, or with `--workspace`, the accounts leased to
 * those workspaces (including other members' accounts).
 */
export const accounts = async (options: AccountsOptions) => {
  await checkForAuthCredsOtherwiseExit();

  const load = () => Promise.all([getAccounts(options.workspace), getMyWorkspaces()]);

  if (options.json) {
    const [accounts, workspaces] = await load();
    console.log(JSON.stringify(
      {
        accounts,
        workspaces: referencedWorkspaces(
          accounts.flatMap((a) => a.leasedWorkspaceIds ?? []),
          workspaces,
        ),
      },
      null,
      2,
    ));
    return;
  } else {
    const [accounts, workspaces] = await runStep("Loading accounts...", load);

    if (accounts.length === 0) {
      console.log("No accounts found");
      return;
    }

    const workspaceNames = (account: AccountDTO) =>
      (account.leasedWorkspaceIds ?? [])
        .map((id) => workspaces.find((w) => w.id === id)?.name ?? id)
        .join(", ") || dim("-");

    new Table()
      .header(["Type", "Labels", "API Key", "Workspaces", "Account ID", "Created At"])
      .body(
        accounts
          .sort((a, b) => {
            const typeComp = a.type.localeCompare(b.type);
            if (typeComp !== 0) return typeComp;
            return a.createdAt - b.createdAt;
          })
          .map((account) => [
            bold(account.type),
            prettyLabelsColoredForTables(account.labels),
            account.redactedApiKey ? account.redactedApiKey : dim("-"),
            workspaceNames(account),
            dim(account.id),
            dim(formatEpochMillis(account.createdAt)),
          ]),
      )
      .columns([
        new Column().minWidth(12),
        new Column().flexShrink(1),
        new Column().minWidth(12),
        new Column().flexShrink(1),
        new Column().minWidth(19),
        new Column().minWidth(22),
      ])
      .maxWidth(Deno.stdout.isTerminal() ? Deno.consoleSize().columns : Infinity)
      .padding(4)
      .render();
  }
};

/** Like {@link getOrAskForAccount}, but only for accounts the user owns. */
async function getOrAskForOwnAccount(id: string | undefined, verb: string): Promise<AccountDTO> {
  const [account, me] = await Promise.all([
    getOrAskForAccount(id, verb),
    getLoggedInUser(),
  ]);
  if (account.userId !== me.id) {
    throw new UserFacingError("Only the account's owner can lease or unlease it.");
  }
  return account;
}

/** Loads an account by id, or lets the user pick one of their own accounts. */
async function getOrAskForAccount(id: string | undefined, verb: string): Promise<AccountDTO> {
  let account: AccountDTO | undefined;
  if (id) {
    account = await runStep("Loading account...", () => getAccountById(id));
  } else if (Deno.stdout.isTerminal()) {
    account = await askUserForAccount(`Choose an account to ${verb}`);
  }
  if (!account) {
    throw new UserFacingError(
      "You must provide an account ID or select one in an interactive terminal",
    );
  }
  return account;
}

/** Offers to stop the glues blocking an action. Returns whether they were stopped. */
async function offerToStopGlues(glues: GlueDTO[], reason: string): Promise<boolean> {
  const glueList = glues.map((glue) => `${green(glue.name)} (${glue.id})`).join(",");
  if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
    throw new UserFacingError(`${reason}: ${glueList}`);
  }
  console.log(`${reason}:`);
  console.log(glueList);
  const confirm = await Confirm.prompt({
    message: `Stop these glues?`,
    default: false,
  });
  if (!confirm) {
    return false;
  }
  for (const glue of glues) {
    await runStep(`Stopping glue ${glue.name} (${glue.id})...`, async () => {
      await stopGlue(glue.id);
    });
  }
  console.log(`\n`);
  return true;
}

export const deleteAccountCmd = async (_options: unknown, id?: string) => {
  await checkForAuthCredsOtherwiseExit();

  const accountToDelete = await getOrAskForAccount(id, "delete");

  if (accountToDelete.liveGlues.length > 0) {
    const stopped = await offerToStopGlues(
      accountToDelete.liveGlues,
      "This account is being used by the following glues that need to be stopped first",
    );
    if (!stopped) {
      return;
    }
  }
  const confirm = await Confirm.prompt({
    message: `Are you sure you want to delete the ${
      displayNameForAccount(accountToDelete)
    } account?`,
    default: false,
  });

  if (confirm) {
    await runStep(`Deleting ${displayNameForAccount(accountToDelete)} account...`, async () => {
      await deleteAccount(accountToDelete.id);
    });
  }
};

/** Lets glues in a workspace use one of the user's accounts. */
export const leaseAccountCmd = async (options: WorkspaceOptions, id?: string) => {
  await checkForAuthCredsOtherwiseExit();

  const account = await getOrAskForOwnAccount(id, "lease to a workspace");
  const leased = new Set(account.leasedWorkspaceIds ?? []);
  const workspace = await pickWorkspace(options, {
    purpose: "lease the account to",
    filter: (w) => !leased.has(w.id),
    ineligibleReason: "already has this account",
    noneEligibleMessage: "The account is already leased to all of your workspaces.",
  });

  await runStep(
    `Leasing ${displayNameForAccount(account)} account to ${describeWorkspace(workspace)}...`,
    () => leaseAccount(account.id, workspace.id),
  );
};

/** Stops glues in a workspace from using one of the user's accounts. */
export const unleaseAccountCmd = async (options: WorkspaceOptions, id?: string) => {
  await checkForAuthCredsOtherwiseExit();

  const account = await getOrAskForOwnAccount(id, "unlease from a workspace");
  const leased = new Set(account.leasedWorkspaceIds ?? []);
  const workspace = await pickWorkspace(options, {
    purpose: "unlease the account from",
    filter: (w) => leased.has(w.id) && !w.personal,
    ineligibleReason:
      "isn't a shared workspace this account is leased to (accounts always stay leased to your personal workspace)",
    noneEligibleMessage: "The account isn't leased to any of your shared workspaces.",
  });

  const unlease = () =>
    runStep(
      `Unleasing ${displayNameForAccount(account)} account from ${describeWorkspace(workspace)}...`,
      () => unleaseAccount(account.id, workspace.id),
    );
  let result = await unlease();
  if (result.success) {
    return;
  }

  if (result.gluesNeedingStopping.length === 0) {
    // The glues using the account aren't visible to this user, e.g. other
    // members' glues in a workspace they've since left.
    throw new UserFacingError(
      result.error ?? "The account is used by live glues in that workspace",
    );
  }
  const stopped = await offerToStopGlues(
    result.gluesNeedingStopping,
    "This account is being used by the following glues in the workspace that need to be stopped first",
  );
  if (!stopped) {
    return;
  }
  result = await unlease();
  if (!result.success) {
    throw new UserFacingError(result.error ?? "Failed to unlease the account");
  }
};
