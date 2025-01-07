import { onGmailEvent, onWebhook } from "./runtime/webhook.ts";
// import { IncomingWebhook } from "npm:@slack/webhook";

// const slackWebhook = new IncomingWebhook(Deno.env.get("SLACK_WEBHOOK_URL")!);

onGmailEvent((event) => {
  console.log("got gmail event", event);
});

// onWebhook(async (_event) => {
//   await slackWebhook.send({
//     text: "Hello, world!",
//   });
// });

onWebhook((event) => {
  console.log(`event details: ${JSON.stringify(event)}`);
});
