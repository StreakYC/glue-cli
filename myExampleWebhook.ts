import { onWebhook } from "./runtime/glue.ts";

// onGmailMessage((event) => {
//   console.log("got gmail event", event);
// });

onWebhook((event) => {
  console.log(`event details: ${JSON.stringify(event)}`);
  console.log("one log line");
  console.log("another log line");
});
