import { Hono } from "hono";
import { setAuthToken } from "../auth.ts";
import { GLUE_API_SERVER } from "../common.ts";
import { open } from "@opensrc/deno-open";

export const login = async () => {
  const app = new Hono();

  app.get("*", (c) => {
    const dataStr = c.req.query("data");
    if (!dataStr) {
      return c.text("No data provided");
    }
    const data = JSON.parse(dataStr);

    const token = data.token;
    const email = data.user.email;

    setAuthToken(token);

    console.log(`Successfully logged in as ${email}`);

    // Shutdown the server after sending the response
    queueMicrotask(() => server.shutdown());

    return c.text(`Logged in as ${email}. You can close this window and return to the CLI.`);
  });

  const server = Deno.serve({
    onListen() {
      console.log(`Waiting for login...`);
    },
    port: 8123,
  }, app.fetch);

  const loginUrl = `${GLUE_API_SERVER}/login`;
  console.log(`Opening login page: ${loginUrl}`);
  await open(loginUrl);

  await server.finished;
};
