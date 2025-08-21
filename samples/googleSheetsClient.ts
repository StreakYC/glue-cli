import { glue } from "jsr:@streak-glue/runtime";
import { OAuth2Client } from "npm:google-auth-library@10";
import { GoogleSpreadsheet } from "npm:google-spreadsheet@5";

const googleCredFetcher = glue.google.getCredentialFetcher({
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

glue.webhook.onGet(async (_event) => {
  console.log("GET request received");
  const credential = await googleCredFetcher();

  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: credential.accessToken });

  // this needs to be changed to be an id of a sheet you have access to
  const sheetId = "106zzBhXrCbbdHZ4PnUn8Lm6LQRZPYxl0kM9tDWb8irs";
  const doc = new GoogleSpreadsheet(sheetId, auth);

  await doc.loadInfo();
  console.log("Loaded doc:", doc.title);
  console.log("Number of sheets:", doc.sheetCount);
  const sheet = doc.sheetsByIndex[0];
  console.log("First sheet title:", sheet.title);
  const rows = await sheet.getRows({
    offset: 0,
    limit: 1,
  });
  // Assuming that there's a header row with a cell named "Counter"
  const counterValue = rows[0].get("Counter");
  console.log("value:", counterValue);
  rows[0].set("Counter", Number(counterValue) + 1);
  await rows[0].save();
  console.log("Updated value:", rows[0].get("Counter"));
});
