import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onWebhook((event) => {
  console.log(`event details: ${JSON.stringify(event)}`);
});

glue.github.onRepoEvent("StreakYC", "glue-backend", ["issues"], (event) => {
  console.log(`issue event: ${JSON.stringify(event)}`);
});

glue.gmail.onMessage((event) => {
  console.log(`subject: ${event.subject}`);
});
