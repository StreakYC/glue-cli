import { z } from "zod";
import { clearAuthToken, exitBecauseNotLoggedIn, getAuthToken } from "./auth.ts";
import { equal } from "@std/assert/equal";
import { delay } from "@std/async/delay";
import { GLUE_API_SERVER, GLUE_CLI_USER_AGENT } from "./common.ts";
import { retry } from "@std/async/retry";
import { Registrations } from "@streak-glue/runtime/backendTypes";

export const GlueEnvironment = z.enum(["dev", "deploy"]);
export type GlueEnvironment = z.infer<typeof GlueEnvironment>;

export const DeploymentAsset = z.object({
  kind: z.literal("file"),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional(),
});
export type DeploymentAsset = z.infer<typeof DeploymentAsset>;

const DeploymentContent = z.object({
  entryPointUrl: z.string(),
  assets: z.record(z.string(), DeploymentAsset),
  envVars: z.record(z.string(), z.string()).optional(),
});
export type DeploymentContent = z.infer<typeof DeploymentContent>;

export const Runner = z.enum(["deno", "deno-v2", "fly", "cloudflare", "sandbox", "sprite"]);
export type Runner = z.infer<typeof Runner>;

const CreateDeploymentParams = z.object({
  deploymentContent: DeploymentContent.optional(),
  optimisticRegistrations: Registrations.optional(),
  runner: Runner.optional(),
});
export type CreateDeploymentParams = z.infer<typeof CreateDeploymentParams>;

export const CreateGlueParams = z.object({
  /** defaults to the user's personal workspace */
  workspaceId: z.string().optional(),
  name: z.string(),
  environment: GlueEnvironment,
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  deployment: CreateDeploymentParams,
});
export type CreateGlueParams = z.infer<typeof CreateGlueParams>;

export const UpdateGlueParams = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  running: z.boolean().optional(),
  currentDeploymentId: z.string().optional(),
  triggerStorage: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateGlueParams = z.infer<typeof UpdateGlueParams>;

export async function backendRequest<T>(
  path: string,
  options: RequestInit = {},
  forceTrace = true,
): Promise<T> {
  options.signal?.throwIfAborted();

  const res = await backendFetch(path, options, forceTrace);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed request: ${path} (${
        options.method ?? "GET"
      }): ${res.status} ${res.statusText} ${body}`,
    );
  }
  return res.json() as Promise<T>;
}

async function backendFetch(
  path: string,
  options: RequestInit = {},
  forceTrace = true,
): Promise<Response> {
  options.signal?.throwIfAborted();

  const authToken = await getAuthToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${authToken}`);
  headers.set("User-Agent", GLUE_CLI_USER_AGENT);
  headers.set("X-Glue-Set-Timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  if (forceTrace) {
    headers.set("X-Cloud-Trace-Context", `00000000000000000000000000000000/0;o=1`);
  }

  const res = await fetch(`${GLUE_API_SERVER}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    await clearAuthToken();
    exitBecauseNotLoggedIn();
  }
  return res;
}

export async function getLoggedInUser(signal?: AbortSignal): Promise<UserDTO> {
  return await backendRequest<UserDTO>("/users/me", { signal });
}

/**
 * Returns every glue with the name in the given workspaces (or all of the
 * user's workspaces). A name can be used by one glue per workspace.
 */
export async function getGluesByName(
  name: string,
  environment: GlueEnvironment,
  workspaceIds?: string[],
  signal?: AbortSignal,
): Promise<GlueDTO[]> {
  return await getGlues({ environment, name, workspaceIds }, signal);
}

export interface GetGluesFilters {
  environment: GlueEnvironment;
  /** defaults to all of the user's workspaces */
  workspaceIds?: string[];
  name?: string;
  includeTags?: string[];
  excludeTags?: string[];
}
export async function getGlues(
  filters: GetGluesFilters = { environment: "deploy", excludeTags: ["archived"] },
  signal?: AbortSignal,
): Promise<GlueDTO[]> {
  const params = new URLSearchParams({ environment: filters.environment });
  if (filters?.workspaceIds) {
    params.set("workspaceIds", filters.workspaceIds.join(","));
  }
  if (filters?.name) {
    params.set("name", filters.name);
  }
  if (filters?.includeTags) {
    params.set("includeTags", filters.includeTags.join(","));
  }
  if (filters?.excludeTags) {
    params.set("excludeTags", filters.excludeTags.join(","));
  }
  return await backendRequest<GlueDTO[]>(`/glues?${params.toString()}`, { signal });
}

export async function getGlueById(id: string, signal?: AbortSignal): Promise<GlueDTO | undefined> {
  return await backendRequest<GlueDTO>(`/glues/${id}`, { signal });
}

export async function stopGlue(id: string, signal?: AbortSignal) {
  await backendRequest<void>(`/glues/${id}/stop`, {
    method: "POST",
    signal,
  });
}

export async function createGlue(
  name: string,
  deployment: CreateDeploymentParams,
  environment: GlueEnvironment,
  options?: {
    workspaceId?: string;
    description?: string | null;
    tags?: string[];
    signal?: AbortSignal;
  },
): Promise<GlueDTO> {
  const res = await backendRequest<GlueDTO>(`/glues`, {
    method: "POST",
    body: JSON.stringify(
      {
        workspaceId: options?.workspaceId,
        name,
        deployment,
        environment,
        description: options?.description,
        tags: options?.tags,
      } satisfies CreateGlueParams,
    ),
    signal: options?.signal,
  });
  return res;
}

export async function updateGlue(
  id: string,
  params: UpdateGlueParams,
  signal?: AbortSignal,
): Promise<GlueDTO> {
  const res = await backendRequest<GlueDTO>(`/glues/${id}`, {
    method: "POST",
    body: JSON.stringify(params satisfies UpdateGlueParams),
    signal,
  });
  return res;
}

export async function createDeployment(
  glueId: string,
  deployment: CreateDeploymentParams,
  signal?: AbortSignal,
): Promise<DeploymentDTO> {
  const res = await backendRequest<DeploymentDTO>(
    `/glues/${glueId}/deployments`,
    {
      method: "POST",
      body: JSON.stringify(deployment),
      signal,
    },
  );
  return res;
}

export async function getDeploymentById(
  id: string,
  includeBuildStepText = false,
  signal?: AbortSignal,
): Promise<DeploymentDTO | undefined> {
  const params = new URLSearchParams();
  if (includeBuildStepText) {
    params.set("includeBuildStepText", "true");
  }
  return await backendRequest<DeploymentDTO>(`/deployments/${id}?${params.toString()}`, { signal });
}

export async function pullDeployment(id: string, signal?: AbortSignal): Promise<DeploymentContent> {
  return DeploymentContent.parse(
    await backendRequest<unknown>(`/deployments/${id}/pull`, { signal }),
  );
}

export async function getDeployments(id: string, signal?: AbortSignal): Promise<DeploymentDTO[]> {
  return await backendRequest<DeploymentDTO[]>(`/glues/${id}/deployments`, { signal });
}

export interface AssociateDeploymentAccountParams {
  type: string;
  accountSelector?: Record<string, string | undefined>;
  accountId: string;
}

export async function associateDeploymentAccount(
  deploymentId: string,
  params: AssociateDeploymentAccountParams,
  signal?: AbortSignal,
): Promise<void> {
  await backendRequest<{ success: true }>(`/deployments/${deploymentId}/associateAccount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
}

function areDeploymentsEqual(a: DeploymentDTO, b: DeploymentDTO): boolean {
  if (a.status !== b.status) {
    return false;
  }
  if (!equal(a.buildSteps, b.buildSteps)) {
    return false;
  }
  if (
    !equal(a.triggers, b.triggers) || !equal(a.accountInjections, b.accountInjections) ||
    !equal(a.secretInjections, b.secretInjections)
  ) {
    return false;
  }
  if (!equal(a.registrationGroupsToSetup, b.registrationGroupsToSetup)) {
    return false;
  }
  if (!equal(a.compatibleAccounts, b.compatibleAccounts)) {
    return false;
  }
  return true;
}

export async function* streamChangesTillDeploymentReady(
  deploymentId: string,
  signal?: AbortSignal,
): AsyncIterable<DeploymentDTO> {
  let lastDeployment: DeploymentDTO | undefined;
  while (true) {
    signal?.throwIfAborted();

    const deployment = await retry(() => getDeploymentById(deploymentId, true, signal), { signal });
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    if (!lastDeployment || !areDeploymentsEqual(lastDeployment, deployment)) {
      lastDeployment = deployment;
      yield deployment;
      if (deployment.status !== "pending" && deployment.status !== "committing") {
        return;
      }
    }
    await delay(2_000, { signal });
  }
}

export async function getExecutions(
  limit: number,
  since: Date | undefined,
  direction: "asc" | "desc" = "desc",
  includeInputData: boolean = false,
  filter: string | undefined = undefined,
  search: string | undefined = undefined,
  triggerId: string | undefined = undefined,
  glueId?: string,
  deploymentId?: string,
  signal?: AbortSignal,
): Promise<ExecutionDTO[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    direction: direction,
    includeInputData: includeInputData.toString(),
  });
  if (since) {
    params.set("since", since.getTime().toString());
  }
  if (filter) {
    params.set("filter", filter);
  }
  if (search) {
    params.set("search", search);
  }
  if (triggerId) {
    params.set("triggerId", triggerId);
  }
  if (glueId) {
    return await backendRequest<ExecutionDTO[]>(
      `/glues/${glueId}/executions?${params.toString()}`,
      { signal },
    );
  } else if (deploymentId) {
    return await backendRequest<ExecutionDTO[]>(
      `/deployments/${deploymentId}/executions?${params.toString()}`,
      { signal },
    );
  }
  throw new Error("Either glueId or deploymentId must be provided");
}

export async function getExecutionById(id: string, signal?: AbortSignal): Promise<ExecutionDTO> {
  return await backendRequest<ExecutionDTO>(`/executions/${id}`, { signal });
}

export async function getExecutionByIdNoThrow(
  id: string,
  signal?: AbortSignal,
): Promise<ExecutionDTO | undefined> {
  try {
    return await backendRequest<ExecutionDTO>(`/executions/${id}`, { signal });
  } catch (_e) {
    return undefined;
  }
}

export async function replayExecution(executionId: string, signal?: AbortSignal) {
  await backendRequest<void>(`/executions/${executionId}/replay`, {
    method: "POST",
    signal,
  });
}

export async function sampleTrigger(triggerId: string, signal?: AbortSignal) {
  await backendRequest<void>(`/triggers/${triggerId}/sample`, {
    method: "POST",
    signal,
  });
}

export interface ExecutionDTO {
  id: string;
  deploymentId: string;
  trigger: TriggerDTO;
  logs: Log[];
  inputData: unknown;
  startedAt: number;
  endedAt?: number;
  state: string;
}

export interface Log {
  timestamp: number;
  type: "stdout" | "stderr";
  text: string;
}

export type DeploymentStatus = "pending" | "committing" | "success" | "failure" | "cancelled";

/** taken from glue-backend */
export interface DeploymentDTO {
  id: string;
  glueId: string;
  status: DeploymentStatus;
  needsUserAuth: boolean;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
  triggers: TriggerDTO[];
  accountInjections: AccountInjectionDTO[];
  secretInjections: SecretInjectionDTO[];
  buildSteps: BuildStepDTO[];
  registrationGroupsToSetup: RegistrationGroupToSetup[];
  /**
   * The user's existing accounts referenced by the `compatibleAccountIds`
   * lists in `registrationGroupsToSetup`.
   */
  compatibleAccounts: AccountSlimDTO[];
  totalExecutions: number;
  totalFailedExecutions: number;
  mostRecentExecution: number | null;
}

/**
 * Represents multiple trigger and account injection registrations that need to
 * be configured to use an account and may be set up together.
 */
export interface RegistrationGroupToSetup {
  type: string;
  accountSelector?: Record<string, string | undefined>;
  accountSetupUrl: string;
  triggerIds: string[];
  accountInjectionIds: string[];
  /** The user's existing accounts that may be used for these registrations. */
  compatibleAccountIds: CompatibleAccountId[];
}

export interface CompatibleAccountId {
  id: string;
  /** Required scopes that this account is currently missing. */
  missingScopes?: string[];
  /**
   * Present when scopes are missing. Sends the user through OAuth to
   * re-authenticate this specific account with the missing scopes.
   */
  accountSetupUrl?: string;
}

export type StepStatus = "success" | "failure" | "in_progress" | "not_started" | "skipped";

export type BuildStepName =
  | "createTunnel"
  | "createTriggers"
  | "deployCode"
  | "registrationAuth"
  | "registrationSetup";
export interface BuildStepDTO {
  name: BuildStepName;
  deploymentId: string;
  status: StepStatus;
  text?: string;
  startTime?: number;
  endTime?: number;
}

export interface TriggerDTO {
  id: string;
  deploymentId: string;
  glueId: string;
  type: string;
  label: string;
  routingId?: string;
  accountId?: string;
  config?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;

  accountSetupUrl?: string;
  description?: string;
  supportsSampleEvents: boolean;
}

export interface AccountInjectionDTO {
  id: string;
  deploymentId: string;
  type: string;
  label: string;
  accountId?: string;
  config?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;

  accountSetupUrl?: string;
  description?: string;
}

export interface SecretInjectionDTO {
  id: string;
  deploymentId: string;
  label: string;
  name: string;
  secretId?: string;

  createdAt: number;
  updatedAt: number;

  secretSetupUrl?: string;
  description?: string;
}

export interface GlueDTO {
  id: string;
  name: string;
  environment: GlueEnvironment;
  /** the user who created the glue */
  userId: string;
  workspaceId: string;
  description: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  creator: UserDTO;
  running: boolean;
  executionSummary: ExecutionSummaryDTO;
  currentDeployment?: DeploymentDTO;
  pendingDeployment?: DeploymentDTO;
  devEventsWebsocketUrl?: string;
}

export interface ExecutionSummaryDTO {
  totalCount: number;
  totalErrorCount: number;
  mostRecent: number | null;
  currentDeploymentCount: number;
  currentDeploymentErrorCount: number;
}

export interface UserDTO {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
}

export interface AccountSlimDTO {
  id: string;
  type: string;
  redactedApiKey?: string;
  labels: Record<string, string>;

  scopes?: string[];
  /** the user who owns the account */
  userId: string;
  /** the workspaces the account is leased to that the requesting user is a member of */
  leasedWorkspaceIds?: string[];
  /** milliseconds since epoch */
  createdAt: number;
  /** milliseconds since epoch */
  updatedAt: number;
}

export interface AccountDTO extends AccountSlimDTO {
  /** Live glues that use this account */
  liveGlues: GlueDTO[];
}

export interface SecretDTO {
  name: string;
  workspaceId: string;
  /** milliseconds since epoch */
  createdAt: number;
  /** milliseconds since epoch */
  updatedAt: number;
}

export interface DeleteSecretResult {
  success: boolean;
  error?: string;
  gluesNeedingStopping: GlueDTO[];
}

/**
 * Returns the user's own accounts, or with `workspaceIds`, the accounts leased
 * to those workspaces (including other members' accounts).
 */
export async function getAccounts(workspaceIds?: string[]): Promise<AccountDTO[]> {
  const query = workspaceIds ? `?workspaceIds=${workspaceIds.join(",")}` : "";
  return await backendRequest<AccountDTO[]>(`/accounts${query}`);
}

export async function getAccountById(id: string): Promise<AccountDTO | undefined> {
  return await backendRequest<AccountDTO>(`/accounts/${id}`);
}

export async function deleteAccount(id: string): Promise<void> {
  await backendRequest<void>(`/accounts/${id}`, {
    method: "DELETE",
  });
}

/** Returns the secrets in the given workspaces, or all of the user's workspaces. */
export async function getSecrets(workspaceIds?: string[]): Promise<SecretDTO[]> {
  const query = workspaceIds ? `?workspaceIds=${workspaceIds.join(",")}` : "";
  return await backendRequest<SecretDTO[]>(`/secrets${query}`);
}

export async function setSecret(name: string, value: string, workspaceId: string): Promise<void> {
  await backendRequest<unknown>(`/secrets/${encodeURIComponent(name)}?workspaceId=${workspaceId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
}

export async function deleteSecret(name: string, workspaceId: string): Promise<DeleteSecretResult> {
  const path = `/secrets/${encodeURIComponent(name)}?workspaceId=${workspaceId}`;
  const res = await backendFetch(path, { method: "DELETE" });
  if (res.status === 409 && res.headers.get("Content-Type")?.includes("application/json")) {
    return await res.json() as DeleteSecretResult;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed request: ${path} (DELETE): ${res.status} ${res.statusText} ${body}`);
  }
  return await res.json() as DeleteSecretResult;
}

export interface UnleaseAccountResult {
  success: boolean;
  error?: string;
  gluesNeedingStopping: GlueDTO[];
}

export async function leaseAccount(accountId: string, workspaceId: string): Promise<void> {
  await backendRequest<unknown>(`/accounts/${accountId}/leases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
}

export async function unleaseAccount(
  accountId: string,
  workspaceId: string,
): Promise<UnleaseAccountResult> {
  const path = `/accounts/${accountId}/leases/${workspaceId}`;
  const res = await backendFetch(path, { method: "DELETE" });
  if (res.status === 409 && res.headers.get("Content-Type")?.includes("application/json")) {
    return await res.json() as UnleaseAccountResult;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed request: ${path} (DELETE): ${res.status} ${res.statusText} ${body}`);
  }
  return await res.json() as UnleaseAccountResult;
}

// WORKSPACES ------------------------------------------------------------

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceDTO {
  id: string;
  name: string;
  personal: boolean;
  /** The requesting user's role in the workspace */
  role: WorkspaceRole;
  /** milliseconds since epoch */
  createdAt: number;
  /** milliseconds since epoch */
  updatedAt: number;
}

export interface WorkspaceMemberDTO {
  user: UserDTO;
  role: WorkspaceRole;
  /** milliseconds since epoch */
  joinedAt: number;
}

export interface WorkspaceInviteDTO {
  id: string;
  workspaceId: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  role: WorkspaceRole;
  invitedByUserId: string;
  /** milliseconds since epoch */
  expiresAt: number;
  /** milliseconds since epoch */
  createdAt: number;
}

export interface WorkspaceDetailDTO extends WorkspaceDTO {
  members: WorkspaceMemberDTO[];
  /** pending invites */
  invites: WorkspaceInviteDTO[];
}

/** The workspaces the user is a member of, personal workspace first. */
export async function getWorkspaces(): Promise<WorkspaceDTO[]> {
  return await backendRequest<WorkspaceDTO[]>(`/workspaces`);
}

export async function getWorkspace(id: string): Promise<WorkspaceDetailDTO> {
  return await backendRequest<WorkspaceDetailDTO>(`/workspaces/${id}`);
}

export async function createWorkspace(name: string): Promise<WorkspaceDTO> {
  return await backendRequest<WorkspaceDTO>(`/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function renameWorkspace(id: string, name: string): Promise<WorkspaceDTO> {
  return await backendRequest<WorkspaceDTO>(`/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function inviteToWorkspace(
  workspaceId: string,
  email: string,
): Promise<{ invite: WorkspaceInviteDTO; emailSent: boolean }> {
  return await backendRequest(`/workspaces/${workspaceId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  await backendRequest<unknown>(`/workspaces/${workspaceId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function setWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMemberDTO> {
  return await backendRequest<WorkspaceMemberDTO>(
    `/workspaces/${workspaceId}/members/${userId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
}

// MIGRATE ------------------------------------------------------------

export type SecretConflictResolution = "fail" | "useTarget" | "overwrite";

export interface MigrateGlueParams {
  toWorkspaceId: string;
  newName?: string;
  onSecretConflict?: SecretConflictResolution;
  dryRun?: boolean;
}

export interface MigrateGlueSuccess {
  glue: GlueDTO;
  leasedAccountIds: string[];
  secrets: { name: string; action: "copied" | "reused" | "usedTarget" | "overwritten" }[];
  dryRun: boolean;
}

export type MigrateGlueResult =
  | { ok: true; result: MigrateGlueSuccess }
  | {
    ok: false;
    error: "missing_account_leases";
    message: string;
    accounts: {
      id: string;
      type: string;
      labels: Record<string, string>;
      ownerUserId: string;
      ownerEmail?: string;
    }[];
  }
  | { ok: false; error: "secret_conflicts"; message: string; names: string[] }
  | { ok: false; error: "name_conflict"; message: string };

/**
 * Moves a deploy glue to another workspace. The backend's expected failures
 * (missing account leases, secret conflicts, name conflicts) are returned
 * rather than thrown so they can be handled interactively.
 */
export async function migrateGlue(
  glueId: string,
  params: MigrateGlueParams,
): Promise<MigrateGlueResult> {
  const path = `/glues/${glueId}/migrate`;
  const res = await backendFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (res.ok) {
    return { ok: true, result: await res.json() as MigrateGlueSuccess };
  }
  const body = await res.text();
  if (res.status === 409) {
    const parsed = JSON.parse(body);
    if (
      parsed.error === "missing_account_leases" || parsed.error === "secret_conflicts" ||
      parsed.error === "name_conflict"
    ) {
      return { ok: false, ...parsed };
    }
  }
  throw new Error(`Failed request: ${path} (POST): ${res.status} ${res.statusText} ${body}`);
}
