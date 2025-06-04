import { glue } from "jsr:@streak-glue/runtime";

glue.webhook.onGet((_event) => {
  console.log("GET request receiveds17");
});

glue.stripe.onEvents(["customer.updated", "account.updated"], (event) => {
  console.log("Stripe event", event);
});
