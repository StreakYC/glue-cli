import { z } from "zod";
import { clearAuthToken, exitBecauseNotLoggedIn, getAuthToken } from "./auth.ts";
import { delay } from "@std/async/delay";
import { zip } from "@std/collections/zip";
import { GLUE_API_SERVER } from "./common.ts";
import { retry } from "@std/async/retry";
import { Registrations } from "@streak-glue/runtime/internalTypes";

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

const CreateDeploymentParams = z.object({
  deploymentContent: DeploymentContent.optional(),
  optimisticRegistrations: Registrations.optional(),
});
export type CreateDeploymentParams = z.infer<typeof CreateDeploymentParams>;

export const CreateGlueParams = z.object({
  name: z.string(),
  environment: GlueEnvironment,
  description: z.string().optional().nullable(),
  deployment: CreateDeploymentParams,
});
export type CreateGlueParams = z.infer<typeof CreateGlueParams>;

export const UpdateGlueParams = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  running: z.boolean().optional(),
  currentDeploymentId: z.string().optional(),
  triggerStorage: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateGlueParams = z.infer<typeof UpdateGlueParams>;

export async function backendRequest<T>(path: string, options: RequestInit = {}, forceTrace = true): Promise<T> {
  const authToken = await getAuthToken();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${authToken}`,
    "User-Agent": "glue-cli",
    "X-Glue-Set-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  if (forceTrace) {
    headers["X-Cloud-Trace-Context"] = `00000000000000000000000000000000/0;o=1`;
  }

  const res = await fetch(`${GLUE_API_SERVER}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    await clearAuthToken();
    exitBecauseNotLoggedIn();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch ${path}: ${res.statusText} ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function getLoggedInUser(): Promise<UserDTO> {
  return await backendRequest<UserDTO>("/users/me");
}

export async function getGlueByName(name: string, environment: GlueEnvironment): Promise<GlueDTO | undefined> {
  const params = new URLSearchParams({ name, environment });
  const glues = await backendRequest<GlueDTO[]>(`/glues?${params.toString()}`);
  return glues[0];
}

export async function getGlues(environment: GlueEnvironment, nameFilter?: string): Promise<GlueDTO[]> {
  const params = new URLSearchParams({ environment });
  if (nameFilter) {
    params.set("name", nameFilter);
  }
  return await backendRequest<GlueDTO[]>(`/glues?${params.toString()}`);
}

export async function getGlueById(id: string): Promise<GlueDTO | undefined> {
  return await backendRequest<GlueDTO>(`/glues/${id}`);
}

export async function stopGlue(id: string) {
  await backendRequest<void>(`/glues/${id}/stop`, {
    method: "POST",
  });
}

export async function createGlue(name: string, deployment: CreateDeploymentParams, environment: GlueEnvironment): Promise<GlueDTO> {
  const res = await backendRequest<GlueDTO>(`/glues`, {
    method: "POST",
    body: JSON.stringify(
      {
        name,
        deployment,
        environment,
      } satisfies CreateGlueParams,
    ),
  });
  return res;
}

export async function pauseGlue(glueId: string) {
  const payload: UpdateGlueParams = {
    running: false,
  };
  await backendRequest<void>(`/glues/${glueId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resumeGlue(glueId: string) {
  const payload: UpdateGlueParams = {
    running: true,
  };
  await backendRequest<void>(`/glues/${glueId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createDeployment(glueId: string, deployment: CreateDeploymentParams): Promise<DeploymentDTO> {
  const res = await backendRequest<DeploymentDTO>(
    `/glues/${glueId}/deployments`,
    {
      method: "POST",
      body: JSON.stringify(deployment),
    },
  );
  return res;
}

export async function getDeploymentById(id: string): Promise<DeploymentDTO | undefined> {
  return await backendRequest<DeploymentDTO>(`/deployments/${id}`);
}

export async function getDeployments(id: string): Promise<DeploymentDTO[]> {
  return await backendRequest<DeploymentDTO[]>(`/glues/${id}/deployments`);
}

function areDeploymentsEqual(a: DeploymentDTO, b: DeploymentDTO): boolean {
  if (a.status !== b.status || a.buildSteps.length !== b.buildSteps.length) {
    return false;
  }
  if (
    zip(a.buildSteps, b.buildSteps)
      .some(([stepA, stepB]) => stepA.name !== stepB.name || stepA.title !== stepB.title || stepA.status !== stepB.status)
  ) {
    return false;
  }
  return true;
}

export async function* streamChangesToDeployment(deploymentId: string): AsyncIterable<DeploymentDTO> {
  let lastDeployment: DeploymentDTO | undefined;
  while (true) {
    const deployment = await retry(() => getDeploymentById(deploymentId));
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    if (!lastDeployment || !areDeploymentsEqual(lastDeployment, deployment)) {
      lastDeployment = deployment;
      yield deployment;
      if (deployment.status !== "pending") {
        return;
      }
    }
    await delay(2_000);
  }
}

export async function getExecutions(
  glueId: string,
  limit: number,
  startingPoint: Date,
  direction: "asc" | "desc",
  includeInputData: boolean = false,
  filter: string | undefined = undefined,
): Promise<ExecutionDTO[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    startingPoint: startingPoint.getTime().toString(),
    direction,
    includeInputData: includeInputData.toString(),
  });
  if (filter) {
    params.set("filter", filter);
  }
  return await backendRequest<ExecutionDTO[]>(`/glues/${glueId}/executions?${params.toString()}`);
}

export async function getExecutionById(id: string): Promise<ExecutionDTO> {
  return await backendRequest<ExecutionDTO>(`/executions/${id}`);
}

export async function getExecutionByIdNoThrow(id: string): Promise<ExecutionDTO | undefined> {
  try {
    return await backendRequest<ExecutionDTO>(`/executions/${id}`);
  } catch (_e) {
    return undefined;
  }
}

export async function replayExecution(executionId: string) {
  await backendRequest<void>(`/executions/${executionId}/replay`, {
    method: "POST",
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

export type DeploymentStatus = "pending" | "success" | "failure" | "cancelled";

/** taken from glue-backend */
export interface DeploymentDTO {
  id: string;
  glueId: string;
  status: DeploymentStatus;
  needsUserAuth: boolean;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
  triggers: TriggerDTO[];
  buildSteps: BuildStepDTO[];
}

export type StepStatus = "success" | "failure" | "in_progress" | "not_started" | "skipped";

export interface BuildStepDTO {
  name: string;
  deploymentId: string;
  title: string;
  status: StepStatus;
  text?: string;
  startTime?: number;
  endTime?: number;
}

export interface TriggerDTO {
  id: string;
  deploymentId: string;
  type: string;
  label: string;
  routingId?: string;
  accountId?: string;
  config?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;

  accountSetupUrl?: string;
  description?: string;
}

export interface GlueDTO {
  id: string;
  name: string;
  environment: GlueEnvironment;
  userId: string;
  description: string | null;
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

export interface AccountDTO {
  id: string;
  type: string;
  selector: string;
  displayName?: string;
  redactedApiKey?: string;
  scopes?: string[];
  userId: string;
  /** milliseconds since epoch */
  createdAt: number;
  /** milliseconds since epoch */
  updatedAt: number;
  /** Live glues that use this account */
  liveGlues: GlueDTO[];
}

export async function getAccounts(): Promise<AccountDTO[]> {
  return await backendRequest<AccountDTO[]>(`/accounts`);
}

export async function getAccountById(id: string): Promise<AccountDTO | undefined> {
  return await backendRequest<AccountDTO>(`/accounts/${id}`);
}

export async function deleteAccount(id: string): Promise<void> {
  await backendRequest<void>(`/accounts/${id}`, {
    method: "DELETE",
  });
}
