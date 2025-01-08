import { kv } from "../db.ts";
export const logout = async () => {
  await kv.delete(["userEmail"]);
  console.log("Logged out");
};
