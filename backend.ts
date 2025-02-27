import { getLoggedInUser } from "./auth.ts";
import { delay } from "@std/async/delay";
import { zip } from "@std/collections/zip";
import { encodeBase64 } from "@std/encoding";
import { GLUE_API_SERVER } from "./common.ts";
import { RegisteredTrigger } from "./runtime/common.ts";

export async function backendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const userEmail = await getLoggedInUser();
  const res = await fetch(`${GLUE_API_SERVER}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${encodeBase64(userEmail + ":")}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getGlueByName(name: string, environment: string): Promise<GlueDTO | undefined> {
  const params = new URLSearchParams({ name, environment });
  const glues = await backendRequest<GlueDTO[]>(`/glues?${params.toString()}`);
  return glues[0];
}

export async function getGlueById(id: string): Promise<GlueDTO | undefined> {
  return await backendRequest<GlueDTO>(`/glues/${id}`);
}

export async function createGlue(name: string, registeredTriggers: RegisteredTrigger[], environment: string): Promise<GlueDTO> {
  const res = await backendRequest<GlueDTO>(`/glues`, {
    method: "POST",
    body: JSON.stringify({
      name,
      deployment: { optimisticTriggers: registeredTriggers },
      environment,
    }),
  });
  return res;
}

export async function createDeployment(glueId: string, registeredTriggers: RegisteredTrigger[]) {
  const res = await backendRequest<DeploymentDTO>(
    `/glues/${glueId}/deployments`,
    {
      method: "POST",
      body: JSON.stringify({ optimisticTriggers: registeredTriggers }),
    },
  );
  return res;
}

export async function getDeploymentById(id: string): Promise<DeploymentDTO | undefined> {
  return await backendRequest<DeploymentDTO>(`/deployments/${id}`);
}

async function getDeploymentByIdWithLogs(id: string): Promise<DeploymentWithLogsDTO | undefined> {
  return await backendRequest<DeploymentWithLogsDTO>(`/deployments/${id}?includeBuildSteps=true`);
}

function areDeploymentsWithLogsEqual(a: DeploymentWithLogsDTO, b: DeploymentWithLogsDTO): boolean {
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

export async function* getBuildLogs(deploymentId: string): AsyncIterable<DeploymentWithLogsDTO> {
  let lastDeployment: DeploymentWithLogsDTO | undefined;
  while (true) {
    const deployment = await getDeploymentByIdWithLogs(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    if (!lastDeployment || !areDeploymentsWithLogsEqual(lastDeployment, deployment)) {
      lastDeployment = deployment;
      yield deployment;
      if (deployment.status !== "pending") {
        return;
      }
    }
    await delay(5_000);
  }
}

type DeploymentStatus = "pending" | "success" | "failure";

/** taken from glue-backend */
export interface DeploymentDTO {
  id: string;
  glueId: string;
  status: DeploymentStatus;
  needsUserAuth: boolean;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
  triggers?: TriggerDTO[];
  triggerStorage?: Record<string, unknown>;
}

type StepStatus = "success" | "failure" | "running";

export interface BuildStepDTO {
  name: string;
  deploymentId: string;
  title: string;
  status: StepStatus;
  text?: string;
  startTime?: number;
  endTime?: number;
}

export interface DeploymentWithLogsDTO extends DeploymentDTO {
  buildSteps: BuildStepDTO[];
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
  state: string;
  currentDeployment?: DeploymentDTO;
  currentDeploymentId?: string;
  devEventsWebsocketUrl?: string;
}

export type GlueEnvironment = "dev" | "deploy";

export interface UserDTO {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
}
