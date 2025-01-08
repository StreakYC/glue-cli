import { kv } from "../db.ts";
import { Input } from "@cliffy/prompt";
import { GLUE_API_SERVER } from "../common.ts";

export const login = async () => {
  // TODO actual auth
  const email = await Input.prompt(`What's your email address?`);
  const signupRes = await fetch(`${GLUE_API_SERVER}/signup`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (
    signupRes.status === 400 &&
    /^application\/json(^|;)/.test(
      signupRes.headers.get("Content-Type") ?? "",
    ) &&
    (await signupRes.json()).error === "User already exists"
  ) {
    // it's fine
  } else if (!signupRes.ok) {
    throw new Error(`Failed to sign up: ${signupRes.statusText}`);
  }
  await kv.set(["userEmail"], email);
  console.log(`Logged in as ${JSON.stringify(email)}`);
};
