#!/usr/bin/env -S deno run --allow-all
import { type ArgumentValue, Command, EnumType, ValidationError } from "@cliffy/command";
import { deploy } from "./commands/deploy.ts";
import { dev } from "./commands/dev.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { whoami } from "./commands/whoami.ts";
import { list } from "./commands/list.ts";
import { describe } from "./commands/describe.ts";
import { logs } from "./commands/logs.ts";
import { stop } from "./commands/stop.ts";
import { share } from "./commands/share.ts";
import {
  accounts,
  deleteAccountCmd,
  leaseAccountCmd,
  unleaseAccountCmd,
} from "./commands/accounts.ts";
import { create } from "./commands/create.ts";
import { replay } from "./commands/replay.ts";
import { pull } from "./commands/pull.ts";
import { tag } from "./commands/tag.ts";
import { Runner } from "./backend.ts";
import type z from "zod";
import { archive } from "./commands/archive.ts";
import { unarchive } from "./commands/unarchive.ts";
import { deleteSecretCmd, listSecrets, setSecret } from "./commands/secrets.ts";
import { installSkills } from "./commands/skills.ts";
import { maybeShowUpdateNotice } from "./lib/updateCheck.ts";
import { upgradeCommand } from "./commands/upgrade.ts";
import { setColorEnabled } from "@std/fmt/colors";
import { GLUE_CLI_VERSION } from "./common.ts";
import { migrate, SECRET_CONFLICT_OPTIONS } from "./commands/migrate.ts";
import {
  createWorkspaceCmd,
  inviteCmd,
  leaveCmd,
  listWorkspacesCmd,
  membersCmd,
  removeMemberCmd,
  renameCmd,
  setRoleCmd,
} from "./commands/workspace.ts";
import { WORKSPACE_ID_REGEX } from "./lib/workspaces.ts";
import { UserFacingError } from "./lib/UserFacingError.ts";

const useColors = !Deno.noColor && Deno.stdout.isTerminal();
setColorEnabled(useColors);

const cmd = new Command()
  .name("glue")
  .version(GLUE_CLI_VERSION)
  .description("Glue CLI utility")
  .help({
    // work around https://github.com/c4spar/cliffy/issues/695
    colors: useColors,
  })
  .globalAction(async (options) => {
    await maybeShowUpdateNotice(GLUE_CLI_VERSION, upgradeCommand, isJsonOutput(options));
  })
  .action(() => {
    cmd.showHelp();
  })
  .globalOption("--verbose", "Enable verbose logging for debugging purposes", { default: false })
  .globalType("workspace-id", validateWorkspaceId)
  .globalOption(
    "--workspace <workspaceIds:workspace-id[]>",
    "Workspace ids to operate on, comma separated. Defaults to all of your workspaces, or asks when a command needs exactly one. See `glue workspace list`.",
    { separator: "," },
  )
  .command("upgrade", upgradeCommand)
  // DEV ----------------------------
  .command(
    "dev",
    "Run a glue locally for development. Your glue is run immediately and your top level triggers are setup. By default a debug port is opened, but can be disabled with --no-debug.",
  )
  .option("-n, --name <name:string>", "Set glue name")
  .option(
    "--inspect-wait",
    "Enable the debugger and wait for a connection before proceeding with execution.",
  )
  .option("--no-debug", "Disable the debugger")
  .option(
    "--replay <executionId:string>",
    "Replay a specific execution by ID as soon as the glue is locally running. The execution doesn't have to be from the same glue but it does have to have a compatible trigger/label pair. Useful to debug why a deployed glue didn't behave as expected.",
  )
  .arguments("<file:string>")
  .action(dev)
  // DEPLOY ----------------------------
  .command("deploy", "Deploy a glue")
  .option("-n, --name <name:string>", "Glue name")
  .type("runner", validateWithZodEnum(Runner))
  .option(
    "-r, --runner <runner:runner>",
    "Use a specific runner to host the glue. Valid values are: deno, deno-v2, fly, cloudflare, sandbox.",
    {
      default: "sprite",
      hidden: true,
      action: () => {
        throw new ValidationError(
          "--runner is not supported. Remove it from your command. Glue chooses the runner automatically.",
        );
      },
    },
  )
  .option("--tag <tag:string>", "Add tags to the glue (repeatable)", { collect: true })
  .option(
    "--debug-write-create-deployment-params <path:string>",
    "Write the output of getCreateDeploymentParams to a JSON file for debugging",
    { hidden: true },
  )
  .arguments("<file:string>")
  .action(deploy)
  // CREATE ----------------------------
  .command(
    "create",
    "Create a new glue from a basic template",
  )
  .action(create)
  // INSTALL SKILLS ----------------------------
  .command(
    "install-skills",
    "Install the Glue related skills for Codex and Claude Code and other agents if you have them installed",
  )
  .action(installSkills)
  // LIST ----------------------------
  .command("list", "List all of your deployed glues")
  .option("-n, --name <name:string>", "Filter glues by name")
  .option("-t, --tag <tag:string[]>", "Filter glues by tag", { separator: "," })
  .option("-e, --exclude-tags <excludeTags:string[]>", "Exclude glues by tag", { separator: " " })
  .option("-a, --all", "Show all glues, including archived ones")
  .option("-j, --json", "Output in JSON format")
  .action(list)
  // TAG ----------------------------
  .command("tag", "Add, remove, or replace tags on one or more glues")
  .arguments("[...glueNames:string]")
  .option("-a, --add <tag:string[]>", "Add tags (repeatable)", { separator: "," })
  .option("-r, --remove <tag:string[]>", "Remove tags (repeatable)", { separator: "," })
  .option("-R, --replace <tag:string[]>", "Replace all tags with the provided set (repeatable)", {
    separator: ",",
  })
  .action(tag)
  // ARCHIVE ----------------------------
  .command("archive", "Archive one or more glues")
  .arguments("[glueNames...:string]")
  .action(archive)
  // UNARCHIVE ----------------------------
  .command("unarchive", "Unarchive one or more glues")
  .arguments("[glueNames...:string]")
  .action(unarchive)
  // STOP ----------------------------
  .command("stop", "Stop a deployed glue")
  .arguments("[name:string]")
  .action(stop)
  // DESCRIBE ----------------------------
  .command(
    "describe",
    "Describe a glue or any other resource. Query can be a glue name or any id for any resource",
  )
  .arguments("[query:string]")
  .option("-j, --json", "Output in JSON format")
  .option("-w, --watch", "Refresh the description every 3 seconds")
  .action(describe)
  // PULL ----------------------------
  .command(
    "pull",
    "Download the code of a deployed glue into the current directory. Query can be a glue name, glue id, or deployment id. Leave blank to pick a glue from a list.",
  )
  .arguments("[query:string]")
  .action(pull)
  // REPLAY ----------------------------
  .command("replay", "Replay an execution of a glue")
  .arguments("<executionId:string>")
  .action(replay)
  // LOGS ----------------------------
  .command(
    "logs",
    "View historical and live stream of the executions of a glue. Provide a glue name, or glue id, or deployment id or leave blank to list a glue to pick from.",
  )
  .arguments("[query:string]")
  .option("-j, --json", "Output in JSON format")
  .option("-n, --number <number:number>", "Number of historical executions to print initially", {
    default: 10,
  })
  .option(
    "-l --log-lines <logLines:number>",
    "Number of log lines to print for each execution. Set to 0 to hide log lines",
    { default: 10 },
  )
  .option("-f, --follow", "Live follow the executions as they happen", { default: false })
  .option(
    "-F, --full-log-lines",
    "Don't clip log lines to the width of the terminal, wrap the full log line. Has no effect in json mode",
    { default: false },
  )
  .option(
    "--filter <filter:string>",
    "Filter executions by state. Only show executions with this state. Valid values are: success, failure, running",
  )
  .option(
    "-s, --search <search:string>",
    "Search for a string in the execution logs, error or input data",
  )
  .option("--trigger <triggerId:string>", "Only show executions for this trigger ID")
  .option("--failures", "Only show failures, shorthand for --filter=failure")
  .action(logs)
  // LOGIN ----------------------------
  .command("login", "Log in to Glue")
  .action(login)
  // LOGOUT ----------------------------
  .command("logout", "Log out from Glue")
  .action(logout)
  // WHOAMI ----------------------------
  .command("whoami", "Get the current user")
  .action(whoami)
  // SHARE ----------------------------
  .command("share", "Share a glue file by creating a GitHub secret gist")
  .arguments("<file:string>")
  .option("-j, --json", "Output in JSON format")
  .action(share)
  // MIGRATE ----------------------------
  .command(
    "migrate",
    "Move a deployed glue to another workspace, along with the accounts and secrets it uses. Use --workspace to say which workspace the glue is in if the name is ambiguous.",
  )
  .arguments("[glue:string]")
  .type("target-workspace-id", validateWorkspaceId)
  .option("--to <workspaceId:target-workspace-id>", "The workspace to move the glue to")
  .option("--new-name <name:string>", "Rename the glue as it moves")
  .type("secret-conflict", new EnumType(SECRET_CONFLICT_OPTIONS))
  .option(
    "--on-secret-conflict <mode:secret-conflict>",
    "What to do when the target workspace has a secret with the same name but a different value: use-target keeps the target's value, overwrite replaces it",
  )
  .option("-y, --yes", "Don't ask for confirmation")
  .action(migrate)
  // WORKSPACES ----------------------------
  .command(
    "workspace",
    new Command<GlobalOptions>()
      .description("Manage workspaces, which glues, secrets, and shared accounts belong to")
      .command("list", "List your workspaces")
      .option("-j, --json", "Output in JSON format")
      .action(listWorkspacesCmd)
      .command("create", "Create a shared workspace")
      .arguments("[name:string]")
      .action(createWorkspaceCmd)
      .command("invite", "Invite someone to a workspace by email")
      .arguments("<email:string>")
      .action(inviteCmd)
      .command("members", "List the members and pending invites of a workspace")
      .option("-j, --json", "Output in JSON format")
      .action(membersCmd)
      .command("rename", "Rename a workspace")
      .arguments("<name:string>")
      .action(renameCmd)
      .command("remove", "Remove a member from a workspace")
      .arguments("<email:string>")
      .option("-y, --yes", "Don't ask for confirmation")
      .action(removeMemberCmd)
      .command("leave", "Leave a workspace")
      .option("-y, --yes", "Don't ask for confirmation")
      .action(leaveCmd)
      .command("set-role", "Make a member an owner, or an owner a member")
      .type("role", new EnumType(["owner", "member"] as const))
      .arguments("<email:string> <role:role>")
      .action(setRoleCmd),
  )
  // ACCOUNTS ----------------------------
  .command(
    "accounts",
    new Command<GlobalOptions>()
      .description("Manage accounts")
      .command(
        "list",
        "List your accounts, or with --workspace, the accounts available in those workspaces",
      )
      .option("-j, --json", "Output in JSON format")
      .action(accounts)
      .command("delete", "Delete an account")
      .arguments("[id:string]")
      .action(deleteAccountCmd)
      .command(
        "lease",
        "Let glues in a workspace use one of your accounts. Members of the workspace can use the account in their glues.",
      )
      .arguments("[id:string]")
      .action(leaseAccountCmd)
      .command("unlease", "Stop glues in a workspace from using one of your accounts")
      .arguments("[id:string]")
      .action(unleaseAccountCmd),
  )
  // SECRETS ----------------------------
  .command(
    "secrets",
    new Command<GlobalOptions>()
      .description(
        "Manage secrets that can be accessed by Glue scripts. Secrets can be used like environment variables.",
      )
      .command(
        "set",
        "Set a secret value for use by Glue scripts.",
      )
      .arguments("<key:string> <value:string>")
      .action(setSecret)
      .command(
        "list",
        "List all secrets",
      )
      .option("-j, --json", "Output in JSON format")
      .action(listSecrets)
      .command(
        "delete",
        "Delete a secret",
      )
      .arguments("<key:string>")
      .action(deleteSecretCmd),
  );
try {
  await cmd.parse(Deno.args);
} catch (e) {
  if (e instanceof UserFacingError) {
    console.error(`error: ${e.message}`);
    Deno.exit(1);
  }
  throw e;
}
Deno.exit(0);

// HELPERS --------------------------------

/**
 * The root command's global options, which Cliffy passes to nested command
 * groups too.
 */
type GlobalOptions = { verbose: boolean; workspace?: string[] };
// deno-lint-ignore no-explicit-any
function validateWithZodEnum(zodEnum: z.ZodEnum<any>) {
  return ({ value }: ArgumentValue): z.infer<typeof zodEnum> => {
    const parsed = zodEnum.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(
        `"${value}" is not a valid runner. Valid values are: ${zodEnum.options.join(", ")}`,
      );
    }
    return parsed.data;
  };
}

function validateWorkspaceId({ value }: ArgumentValue): string {
  if (!WORKSPACE_ID_REGEX.test(value)) {
    throw new ValidationError(
      `"${value}" is not a workspace id. Workspace ids look like w_1a2b3c, see \`glue workspace list\`.`,
    );
  }
  return value;
}

function isJsonOutput(options: unknown): boolean {
  return !!options && typeof options === "object" && "json" in options && options.json === true;
}
