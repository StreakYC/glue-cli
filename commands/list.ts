import { getLoggedInUser } from "../auth.ts";
import { GLUE_API_SERVER } from "../common.ts";
import { encodeBase64 } from "@std/encoding";
interface ListOptions {
  nameFilter?: string;
}

export const list = async (options: ListOptions) => {
  const userEmail = await getLoggedInUser();
  const queryParams = new URLSearchParams();
  if (options.nameFilter) {
    queryParams.set("nameFilter", options.nameFilter);
  }
  const listRes = await fetch(
    `${GLUE_API_SERVER}/glues?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${encodeBase64(userEmail + ":")}`,
      },
    },
  );
  if (!listRes.ok) {
    throw new Error(`Failed to list glues: ${listRes.statusText}`);
  }
  const glues = await listRes.json();
  console.table(glues);
};
