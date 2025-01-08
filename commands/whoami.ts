import { kv } from "../db.ts";

export const whoami = async () => {
  const { value: userEmail } = await kv.get<string>(["userEmail"]);
  if (!userEmail) {
    console.log("You are not logged in.");
  } else {
    console.log(`Logged in as ${JSON.stringify(userEmail)}`);
  }
};
