export const GLUE_API_SERVER = Deno.env.get("GLUE_API_SERVER") ||
  `https://${Deno.env.get("SUDO_USER") ?? Deno.env.get("USER")}-glue.ngrok.app`;
