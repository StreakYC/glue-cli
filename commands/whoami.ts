import { getLoggedInUser } from "../auth.ts";
import { green, red } from "@std/fmt/colors";

export const whoami = async () => {
  const userEmail = await getLoggedInUser(false);
  if (!userEmail) {
    console.log(red("No user logged in") + " " + "Try 'glue login'");
    return;
  }
  console.log(`Logged in as ${green(userEmail)}`);
};
