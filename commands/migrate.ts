import { Confirm } from "@cliffy/prompt/confirm";
import { Input } from "@cliffy/prompt/input";
import { Select } from "@cliffy/prompt/select";
import { bold, dim } from "@std/fmt/colors";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import {
  getGlueById,
  type GlueDTO,
  migrateGlue,
  type MigrateGlueParams,
  type MigrateGlueSuccess,
  type SecretConflictResolution,
} from "../backend.ts";
import { isPrefixId } from "../common.ts";
import { prettyLabels } from "../lib/prettyLabels.ts";
import {
  describeWorkspace,
  findGlueByName,
  getMyWorkspaces,
  pickWorkspace,
  updateFileWorkspaceAfterMove,
  type WorkspaceOptions,
} from "../lib/workspaces.ts";
import { runStep } from "../ui/utils.ts";
import { askUserForGlue } from "./common.ts";

export const SECRET_CONFLICT_OPTIONS = ["use-target", "overwrite"] as const;

interface MigrateOptions extends WorkspaceOptions {
  to?: string;
  newName?: string;
  onSecretConflict?: (typeof SECRET_CONFLICT_OPTIONS)[number];
  yes?: boolean;
}

const isInteractive = () => Deno.stdin.isTerminal() && Deno.stdout.isTerminal();

/**
 * glue migrate [glue] --to <workspace>
 *
 * Moves a deploy glue to another workspace, along with the accounts and
 * secrets it uses. `--workspace` narrows which workspace the glue is found in.
 */
export async function migrate(options: MigrateOptions, query?: string) {
  await checkForAuthCredsOtherwiseExit();

  const glue = await findGlueToMigrate(options, query);
  const workspaces = await getMyWorkspaces();
  const from = workspaces.find((w) => w.id === glue.workspaceId);
  const to = await pickWorkspace({ workspace: options.to ? [options.to] : undefined }, {
    purpose: `move ${glue.name} to`,
    filter: (w) => w.id !== glue.workspaceId,
    ineligibleReason: "is the workspace the glue is already in",
    noneEligibleMessage:
      "You're only in one workspace. Create another with `glue workspace create`.",
  });

  const params: MigrateGlueParams = {
    toWorkspaceId: to.id,
    newName: options.newName,
    onSecretConflict: toSecretConflictResolution(options.onSecretConflict),
  };

  // Do a dry run first, resolving the expected failures, then show the plan.
  const plan = await resolveMigrationPlan(glue, params);
  console.log(
    `\nMoving ${bold(glue.name)} from ${from ? describeWorkspace(from) : glue.workspaceId} to ${
      describeWorkspace(to)
    }${params.newName ? ` as ${bold(params.newName)}` : ""}.`,
  );
  printPlan(plan);

  if (!options.yes) {
    if (!isInteractive()) {
      throw new Error("Pass --yes to migrate when not running in a terminal");
    }
    const confirm = await Confirm.prompt({ message: "Move the glue?", default: false });
    if (!confirm) {
      return;
    }
  }

  const result = await runStep(
    `Moving ${glue.name}...`,
    () => migrateGlue(glue.id, { ...params, dryRun: false }),
  );
  if (!result.ok) {
    // Only possible if something changed since the dry run.
    throw new Error(result.message);
  }
  await updateFileWorkspaceAfterMove(glue.id, to.id);
}

async function findGlueToMigrate(options: MigrateOptions, query?: string): Promise<GlueDTO> {
  let glue: GlueDTO | undefined;
  if (query && isPrefixId(query, "g")) {
    glue = await runStep("Loading glue...", () => getGlueById(query));
  } else if (query) {
    glue = await findGlueByName(query, "deploy", options);
  } else if (isInteractive()) {
    glue = await askUserForGlue(options);
  } else {
    throw new Error("You must provide a glue name when not running in a terminal");
  }
  if (!glue) {
    throw new Error(query ? `Glue ${query} not found` : "No glue found");
  }
  if (glue.environment === "dev") {
    throw new Error("Dev glues can't be migrated");
  }
  return glue;
}

function toSecretConflictResolution(
  option: MigrateOptions["onSecretConflict"],
): SecretConflictResolution {
  switch (option) {
    case "use-target":
      return "useTarget";
    case "overwrite":
      return "overwrite";
    case undefined:
      return "fail";
  }
}

/**
 * Dry-runs the migration until it would succeed, asking the user how to
 * resolve secret and name conflicts along the way. Mutates `params` with their
 * choices.
 */
async function resolveMigrationPlan(
  glue: GlueDTO,
  params: MigrateGlueParams,
): Promise<MigrateGlueSuccess> {
  while (true) {
    const result = await runStep(
      "Checking what needs to move...",
      () => migrateGlue(glue.id, { ...params, dryRun: true }),
    );
    if (result.ok) {
      return result.result;
    }

    switch (result.error) {
      case "secret_conflicts": {
        if (!isInteractive()) {
          throw new Error(
            `The target workspace already has different values for these secrets: ${
              result.names.join(", ")
            }. Pass --on-secret-conflict use-target or overwrite.`,
          );
        }
        console.log(
          `\nThe target workspace already has different values for these secrets: ${
            bold(result.names.join(", "))
          }`,
        );
        params.onSecretConflict = await Select.prompt({
          message: "Which values should the glue use?",
          options: [
            { name: "Keep the target workspace's values", value: "useTarget" },
            { name: "Overwrite them with this glue's values", value: "overwrite" },
          ],
        }) as SecretConflictResolution;
        break;
      }
      case "name_conflict": {
        if (!isInteractive()) {
          throw new Error(
            "The target workspace already has a glue with that name. Pass --new-name to rename it.",
          );
        }
        console.log("\nThe target workspace already has a glue with that name.");
        params.newName = await Input.prompt({ message: "New name for the glue" });
        break;
      }
      case "missing_account_leases": {
        const lines = result.accounts.map((a) =>
          ` - ${a.type} {${prettyLabels(a.labels)}} owned by ${a.ownerEmail ?? a.ownerUserId}: ` +
          `they can run \`glue accounts lease ${a.id} --workspace ${params.toWorkspaceId}\``
        );
        throw new Error(
          `The glue uses accounts that aren't available in the target workspace, and you don't own them:\n${
            lines.join("\n")
          }`,
        );
      }
    }
  }
}

function printPlan(plan: MigrateGlueSuccess) {
  if (plan.leasedAccountIds.length > 0) {
    console.log(
      `Your accounts it uses will be leased to the target workspace: ${
        dim(plan.leasedAccountIds.join(", "))
      }`,
    );
  }
  const actionDescriptions = {
    copied: "copied",
    reused: "already there with the same value",
    usedTarget: "keeping the target workspace's value",
    overwritten: "overwriting the target workspace's value",
  } as const;
  for (const secret of plan.secrets) {
    console.log(`Secret ${bold(secret.name)}: ${actionDescriptions[secret.action]}`);
  }
}
