import { kv } from "./db.ts";
export async function setLoggedInUser(userEmail: string) {
  await kv.set(["userEmail"], userEmail);
}

export async function getLoggedInUser(shouldExitIfNotLoggedIn = true) {
  const userEmail = (await kv.get<string>(["userEmail"])).value;
  if (shouldExitIfNotLoggedIn && !userEmail) {
    console.error("You are not logged in. Try `glue login`.");
    Deno.exit(1);
  }
  return userEmail;
}

export async function isLoggedIn() {
  return (await getLoggedInUser()) !== undefined;
}
