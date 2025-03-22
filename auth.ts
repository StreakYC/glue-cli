import { kv } from "./db.ts";

export const AUTH_TOKEN_KEY = "authToken";

export async function setAuthToken(authToken: string) {
  await kv.set([AUTH_TOKEN_KEY], authToken);
}

export async function getAuthToken() {
  return (await kv.get<string>([AUTH_TOKEN_KEY])).value;
}

export async function clearAuthToken() {
  await kv.delete([AUTH_TOKEN_KEY]);
}

export async function checkForAuthCredsOtherwiseExit() {
  const authToken = await getAuthToken();
  if (!authToken) {
    exitBecauseNotLoggedIn();
  }
}

export function exitBecauseNotLoggedIn() {
  console.error("You are not logged in. Try `glue login`.");
  Deno.exit(1);
}

export async function isLoggedIn() {
  return (await getAuthToken()) !== undefined;
}
