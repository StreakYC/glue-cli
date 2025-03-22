import { checkForAuthCredsOtherwiseExit } from "../auth.ts";
import { getLoggedInUser } from "../backend.ts";

export const whoami = async () => {
  await checkForAuthCredsOtherwiseExit();
  const user = await getLoggedInUser();
  console.log(`Logged in as ${user.email}`);
};
