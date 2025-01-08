import { getLoggedInUser } from "./auth.ts";
import { encodeBase64 } from "@std/encoding";
import { GLUE_API_SERVER } from "./common.ts";

export async function backendRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const userEmail = await getLoggedInUser();
  const res = await fetch(`${GLUE_API_SERVER}/${path}`, {
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
  const glues = await backendRequest<GlueDTO[]>(`glues?${params.toString()}`);
  return glues[0];
}

export async function getGlueById(id: string): Promise<GlueDTO | undefined> {
  return await backendRequest<GlueDTO>(`glues/${id}`);
}

/** taken from glue-backend */
export interface GlueDTO {
  id: string; // string hex representation of the int64 in the db for easy display
  name: string;
  environment: string;
  user_id: string;
  version: number;
  description: string | null;
  created_at: number; // milliseconds since epoch
  updated_at: number; // milliseconds since epoch
  creator: unknown;
  triggers: object[];
  state: string;
  dev_events_websocket_url?: string;
}
