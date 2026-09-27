# Connect your existing Google Sheet

The website sends responses to `/api/responses` on Vercel. That server function
calls Google Apps Script, which writes to your private Sheet and confirms the
participant ID. No Google Form is needed.

## 1. Install the script

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Replace the default `Code.gs` content with the complete contents of
   [`tools/sheets-backend.gs`](../tools/sheets-backend.gs).
3. Save. Select **setupSheet** in the function dropdown and click **Run**.
4. Authorize access using the Google account that owns the Sheet.
5. Return to the Sheet: a **Study Responses** tab now contains the column headers.
   Existing unrelated tabs are untouched. Rerunning setup does not erase responses.

## 2. Deploy the Google endpoint

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Deploy and copy the **Web app URL** ending in `/exec` (not `/dev`).

The Sheet stays private. The endpoint accepts writes only with the server token
and exposes no response-reading endpoint. If your organization does not permit
anonymous web apps, contact your administrator before continuing.

## 3. Connect the website on Vercel

In the Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `GOOGLE_SCRIPT_URL` | The Web app `/exec` URL |
| `GOOGLE_SCRIPT_TOKEN` | Apps Script → Project Settings → Script properties → `SUBMISSION_TOKEN` |

Select the appropriate deployment environments and redeploy the website with
the new `api/responses.js` file. Keep the token in server settings; do not put it
in `index.html`, a public repository, or a chat message.

The browser sends responses only to its own `/api/responses` endpoint. The relay
keeps the credential server-side and handles Google's response redirect.

## 4. Verify before collecting real responses

1. Open the deployed website with `?reset=1&c=control` and complete a test response.
2. Confirm the website says **Saved. You may close this page.**
3. Find the matching participant ID in **Study Responses**. Check the answers,
   `condition`, timestamps, and timing fields.
4. Repeat with `?reset=1&c=treatment`.
5. Refresh after a successful submission: it should not add another row.
6. Remove the known test rows before your study, keeping the headers intact.
7. Share the ordinary website URL without preview or reset parameters.

Submission before configuration reports a saving failure; it never silently
switches to test mode. Pending submissions stay in browser storage until
acknowledged (where browser storage is available), and the page offers a JSON
backup if saving fails. Retried participant IDs return success without adding
another row. A static preview (`npm run dev`) cannot execute the Vercel function;
use `npx vercel dev` with local environment variables for end-to-end development.

Changes to the Apps Script require **Deploy → Manage deployments → Edit → New
version → Deploy**. Keep the `Study Responses` headers unchanged.

## Balanced assignment (upgrade before deploying the website)

1. Replace your Apps Script code with the updated `tools/sheets-backend.gs`.
2. Update the existing web-app deployment: **Deploy → Manage deployments →
   Edit → New version → Deploy**. Keep the same URL and token.
3. Deploy the website, including `api/assignment.js`. It uses the same Vercel
   environment variables as response saving.

When a new participant consents and clicks **Start the game**, the server assigns
the next slot from a shuffled block containing two control and two treatment
slots. The script automatically creates a **Study Assignments** tab. The four
slots are written together; blank participant IDs are reserved slots, not errors.
Do not delete, reorder, or edit these rows during collection.

The script lock serializes simultaneous requests. Retrying the same participant
ID returns its existing assignment without consuming another slot. The browser
saves its ID before requesting assignment, so refreshes can retry safely. If
assignment cannot be confirmed, the study stays on the consent screen with a
retry button; there is no local random fallback.

Each completed block of four newly assigned participants has a 2:2 split.
An incomplete block can differ by up to two participants. This balances assigned
participants, not completed responses: dropouts can still make completion counts
unequal. Existing saved sessions keep their original condition and are outside
the new blocks. Clearing browser storage or using another device creates a new
participant ID.

Preview flags (`?c=control`, `?c=treatment`, or `FORCE_CONDITION`) bypass the
assignment ledger and do not consume slots. Use these for visual checks only;
share the ordinary URL for real recruitment. For a live assignment check, use
four fresh browsers/profiles without preview flags, consent in each, and confirm
two assignments per condition in the new tab. Use a separate test Sheet/deployment
for this check so test assignments do not enter your live blocks.

Run `node tests/assignment.cjs` and `node tests/sheets-saving.cjs` for local
assignment and response-saving checks. A static server cannot assign live
participants; use `npx vercel dev` or preview flags when developing locally.

Official references: [Apps Script web apps](https://developers.google.com/apps-script/guides/web),
[Content Service and redirects](https://developers.google.com/apps-script/guides/content).
