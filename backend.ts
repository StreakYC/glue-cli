import { getLoggedInUser } from "./auth.ts";
import { encodeBase64 } from "@std/encoding";
import { GLUE_API_SERVER } from "./common.ts";
import { RegisteredTriggers } from "./runtime/common.ts";

export async function backendRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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

export async function getGlueByName(
  name: string,
  environment: string,
): Promise<GlueDTO | undefined> {
  const params = new URLSearchParams({ name, environment });
  const glues = await backendRequest<GlueDTO[]>(`/glues?${params.toString()}`);
  return glues[0];
}

export async function getGlueById(id: string): Promise<GlueDTO | undefined> {
  return await backendRequest<GlueDTO>(`/glues/${id}`);
}

export async function createGlue(
  name: string,
  registeredTriggers: RegisteredTriggers,
  environment: string,
): Promise<GlueDTO> {
  const optimisticTriggers = registeredTriggers.webhooks?.map((w) => ({
    type: "webhook",
    label: w.label,
  }));
  const res = await backendRequest<GlueDTO>(`/glues`, {
    method: "POST",
    body: JSON.stringify({
      name,
      deployment: { optimisticTriggers },
      environment,
    }),
  });
  return res;
}

export async function createDeployment(
  glueId: string,
  registeredTriggers: RegisteredTriggers,
) {
  const optimisticTriggers = registeredTriggers.webhooks?.map((w) => ({
    type: "webhook",
    label: w.label,
  }));
  const res = await backendRequest<DeploymentDTO>(
    `/glues/${glueId}/deployments`,
    {
      method: "POST",
      body: JSON.stringify({ optimisticTriggers }),
    },
  );
  return res;
}

export async function getDeploymentById(
  id: string,
): Promise<DeploymentDTO | undefined> {
  return await backendRequest<DeploymentDTO>(`/deployments/${id}`);
}

/** taken from glue-backend */
export interface DeploymentDTO {
  id: string;
  glueId: string;
  isInitializing: boolean;
  needsUserAuth: boolean;
  createdAt: number; // milliseconds since epoch
  updatedAt: number; // milliseconds since epoch
  triggers?: TriggerDTO[];
}

export type TriggerDTO = WebhookTriggerDTO | CronTriggerDTO;
export interface TriggerDTOBase {
  id: string;
  deploymentId: string;
  type: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  stableId?: string;
}
export interface WebhookTriggerDTO extends TriggerDTOBase {
  type: "webhook";
  data: {
    webhookUrl: string;
  };
}
export interface CronTriggerDTO extends TriggerDTOBase {
  type: "cron";
  data: {
    cron: string;
  };
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
