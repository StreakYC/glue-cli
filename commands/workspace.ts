import { UserFacingError } from "../lib/UserFacingError.ts";
import { Input } from "@cliffy/prompt/input";
import { Table } from "@cliffy/table";
import { bold, dim } from "@std/fmt/colors";
import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import {
  createWorkspace,
  getLoggedInUser,
  getWorkspace,
  inviteToWorkspace,
  removeWorkspaceMember,
  renameWorkspace,
  setWorkspaceMemberRole,
  type UserDTO,
  type WorkspaceDetailDTO,
  type WorkspaceDTO,
  type WorkspaceRole,
} from "../backend.ts";
import { describeWorkspace, getMyWorkspaces, pickWorkspace } from "../lib/workspaces.ts";
import type { WorkspaceOptions } from "../lib/workspaces.ts";
import { formatEpochMillis, runStep } from "../ui/utils.ts";
import { confirmUnlessYes } from "../lib/confirm.ts";

interface JsonOptions extends WorkspaceOptions {
  json?: boolean;
}

const isSharedWorkspaceIOwn = (w: WorkspaceDTO) => w.role === "owner" && !w.personal;
const NOT_SHARED_OWNED = "isn't a shared workspace you own";
const NO_SHARED_OWNED =
  "You don't own any shared workspaces. Create one with `glue workspace create`.";

function displayName(user: UserDTO): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/** Finds a member of the workspace by email. */
function findMember(workspace: WorkspaceDetailDTO, email: string) {
  const member = workspace.members.find((m) => m.user.email.toLowerCase() === email.toLowerCase());
  if (!member) {
    throw new UserFacingError(`${email} isn't a member of ${describeWorkspace(workspace)}`);
  }
  return member;
}

/** glue workspace list */
export async function listWorkspacesCmd(options: JsonOptions) {
  await checkForAuthCredsOtherwiseExit();

  if (options.json) {
    console.log(JSON.stringify(await getMyWorkspaces(), null, 2));
    return;
  }

  const workspaces = await runStep("Loading workspaces...", () => getMyWorkspaces());
  new Table()
    .header(["Name", "ID", "Role", "Created At"])
    .body(
      workspaces.map((w) => [
        bold(w.name) + (w.personal ? dim(" (personal)") : ""),
        dim(w.id),
        w.role,
        dim(formatEpochMillis(w.createdAt)),
      ]),
    )
    .padding(4)
    .render();
}

/** glue workspace create [name] */
export async function createWorkspaceCmd(_options: unknown, name?: string) {
  await checkForAuthCredsOtherwiseExit();

  if (!name) {
    if (!Deno.stdin.isTerminal()) {
      throw new UserFacingError("You must provide a workspace name when not running in a terminal");
    }
    name = await Input.prompt({ message: "Workspace name" });
  }

  const workspace = await runStep(
    `Creating workspace ${name}...`,
    () => createWorkspace(name),
  );
  console.log(`\nCreated ${describeWorkspace(workspace)}.`);
  console.log(
    dim(`Invite people with \`glue workspace invite <email> --workspace ${workspace.id}\``),
  );
}

/** glue workspace invite <email> */
export async function inviteCmd(options: WorkspaceOptions, email: string) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, {
    purpose: `invite ${email} to`,
    filter: isSharedWorkspaceIOwn,
    ineligibleReason: NOT_SHARED_OWNED,
    noneEligibleMessage: NO_SHARED_OWNED,
  });
  const { emailSent } = await runStep(
    `Inviting ${email} to ${describeWorkspace(workspace)}...`,
    () => inviteToWorkspace(workspace.id, email),
  );
  if (!emailSent) {
    console.log(dim("The invite was created, but no invite email was sent."));
  }
}

/** glue workspace members */
export async function membersCmd(options: JsonOptions) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, { purpose: "list the members of" });
  const detail = await runStep(
    "Loading members...",
    () => getWorkspace(workspace.id),
    true,
    !!options.json,
  );

  if (options.json) {
    console.log(JSON.stringify(detail, null, 2));
    return;
  }

  new Table()
    .header(["Email", "Name", "Role", "Joined"])
    .body(
      detail.members.map((m) => [
        bold(m.user.email),
        displayName(m.user),
        m.role,
        dim(formatEpochMillis(m.joinedAt)),
      ]),
    )
    .padding(4)
    .render();

  if (detail.invites.length > 0) {
    console.log("\nPending invites:");
    new Table()
      .header(["Email", "Invited", "Expires"])
      .body(
        detail.invites.map((i) => [
          i.email,
          dim(formatEpochMillis(i.createdAt)),
          dim(formatEpochMillis(i.expiresAt)),
        ]),
      )
      .padding(4)
      .render();
  }
}

/** glue workspace rename <name> */
export async function renameCmd(options: WorkspaceOptions, name: string) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, {
    purpose: "rename",
    filter: (w) => w.role === "owner",
    ineligibleReason: "isn't one you own",
  });
  await runStep(
    `Renaming ${describeWorkspace(workspace)} to ${name}...`,
    () => renameWorkspace(workspace.id, name),
  );
}

interface YesOptions extends WorkspaceOptions {
  yes?: boolean;
}

/** glue workspace remove <email> */
export async function removeMemberCmd(options: YesOptions, email: string) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, {
    purpose: `remove ${email} from`,
    filter: isSharedWorkspaceIOwn,
    ineligibleReason: NOT_SHARED_OWNED,
    noneEligibleMessage: NO_SHARED_OWNED,
  });
  const detail = await runStep("Loading members...", () => getWorkspace(workspace.id));
  const member = findMember(detail, email);

  const confirm = await confirmUnlessYes(
    `Remove ${email} from ${describeWorkspace(workspace)}?`,
    options.yes,
  );
  if (!confirm) {
    return;
  }
  await runStep(
    `Removing ${email}...`,
    () => removeWorkspaceMember(workspace.id, member.user.id),
  );
}

/** glue workspace leave */
export async function leaveCmd(options: YesOptions) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, {
    purpose: "leave",
    filter: (w) => !w.personal,
    ineligibleReason: "can't be left because it's your personal workspace",
    noneEligibleMessage: "You're only in your personal workspace, which can't be left.",
  });

  const confirm = await confirmUnlessYes(`Leave ${describeWorkspace(workspace)}?`, options.yes);
  if (!confirm) {
    return;
  }
  const me = await getLoggedInUser();
  await runStep(
    `Leaving ${describeWorkspace(workspace)}...`,
    () => removeWorkspaceMember(workspace.id, me.id),
  );
}

/** glue workspace set-role <email> <role> */
export async function setRoleCmd(options: WorkspaceOptions, email: string, role: WorkspaceRole) {
  await checkForAuthCredsOtherwiseExit();

  const workspace = await pickWorkspace(options, {
    purpose: `change the role of ${email} in`,
    filter: isSharedWorkspaceIOwn,
    ineligibleReason: NOT_SHARED_OWNED,
    noneEligibleMessage: NO_SHARED_OWNED,
  });
  const detail = await runStep("Loading members...", () => getWorkspace(workspace.id));
  const member = findMember(detail, email);

  await runStep(
    `Making ${email} ${role === "owner" ? "an owner" : "a member"} of ${
      describeWorkspace(workspace)
    }...`,
    () => setWorkspaceMemberRole(workspace.id, member.user.id, role),
  );
}
