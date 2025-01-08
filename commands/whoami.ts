import { getLoggedInUser } from "../auth.ts";

export const whoami = async () => {
  const userEmail = await getLoggedInUser(false);
  console.log(`Logged in as ${userEmail}`);
};
