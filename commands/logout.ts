import { clearAuthToken } from "../auth.ts";

export const logout = async () => {
  await clearAuthToken();
  console.log("Logged out");
};
