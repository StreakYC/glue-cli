import { glue } from "jsr:@streak-glue/runtime";
import { gmail_v1 } from "npm:@googleapis/gmail@14";
import { OAuth2Client } from "npm:google-auth-library@10";

const googleCredFetcher = glue.google.getCredentialFetcher({
  scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.profile"],
});

glue.webhook.onGet(async (_event) => {
  console.log("GET request received");
  const credential = await googleCredFetcher();

  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: credential.accessToken });

  const gmail = new gmail_v1.Gmail({ auth });

  // example Gmail API usage
  const profile = await gmail.users.getProfile({ userId: "me" });
  console.log("User profile:", profile.data);
});
