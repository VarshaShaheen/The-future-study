/**
 * ============================================================
 *  ONE-CLICK BACKEND SETUP
 *  "Whose Future Are You Saving For?" — green deposit experiment
 * ============================================================
 *
 *  This builds your Google Form + linked response Sheet, then
 *  prints the exact CONFIG block to paste into index.html.
 *
 *  HOW TO RUN
 *  1. Go to  script.google.com  →  New project
 *  2. Delete whatever is in the editor, paste this whole file
 *  3. Press Run (▶).  Choose  setUpEverything  if asked.
 *  4. Google will ask you to authorise the script — allow it.
 *     ("unverified app" → Advanced → Go to project → Allow.
 *      It is your own script running in your own account.)
 *  5. Open  View → Logs  (or Execution log).
 *     Copy the CONFIG block it prints into index.html.
 *
 *  Takes about 30 seconds. You never open the form itself.
 * ============================================================
 */

var FIELDS = [
  "participant_id","condition","consent",
  "q1_age","q2_made_investment","q3_has_deposit","q4_heard_green",
  "q5_choice_round1","q6_choice_round2","switch_category","switched",
  "q7_main_reason","q7_other_text","q8_env_importance",
  "q9_altruism_statement","q9b_altruism_agree",
  "q10_bequest_importance","q11_bequest_agree",
  "q12_trust_bank","q13_transparency",
  "final_choice","q14_confidence",
  "q15_observed_pollution","q16_local_concern",
  "q17_gender","q18_education","q19_employment","q20_income","q21_district",
  "time_round1_s","time_intervention_s","time_round2_s","time_total_s",
  "started_at","submitted_at"
];

function setUpEverything() {
  var form = FormApp.create("Green Deposit Game — response sink (do not share)");
  form.setDescription(
    "Automated data sink for the study 'Whose Future Are You Saving For?'. " +
    "Participants never see this form — they use the custom interface. Do not edit or reorder these questions."
  );

  // Every field is a plain text item so no answer can ever be rejected.
  FIELDS.forEach(function (name) {
    form.addTextItem().setTitle(name).setRequired(false);
  });

  // Accept anonymous responses, one browser can submit many times.
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setProgressBar(false);
  form.setAcceptingResponses(true);
  try { form.setRequireLogin(false); } catch (e) { /* consumer accounts: already off */ }
  try { form.setLimitOneResponsePerUser(false); } catch (e) { /* ditto */ }

  // Linked spreadsheet for the responses.
  var ss = SpreadsheetApp.create("Green Deposit Game — responses");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Ask the form for a prefilled URL where every answer is its own field name.
  // The resulting query string IS the entry-id map.
  var resp = form.createResponse();
  form.getItems(FormApp.ItemType.TEXT).forEach(function (item) {
    var t = item.asTextItem();
    resp = resp.withItemResponse(t.createResponse(t.getTitle()));
  });
  var prefilled = resp.toPrefilledUrl();

  var map = {};
  prefilled.split("?")[1].split("&").forEach(function (kv) {
    var p = kv.split("=");
    if (p[0].indexOf("entry.") === 0) map[decodeURIComponent(p[1])] = p[0];
  });

  var formId = form.getPublishedUrl().match(/\/e\/([^\/]+)\//);
  formId = formId ? formId[1] : "(could not parse — see published URL below)";

  var pad = 0;
  FIELDS.forEach(function (f) { pad = Math.max(pad, f.length); });

  var out = [];
  out.push("");
  out.push("========== PASTE THIS INTO index.html ==========");
  out.push("");
  out.push('  FORM_ID: "' + formId + '",');
  out.push("");
  out.push("  ENTRY: {");
  FIELDS.forEach(function (f, i) {
    var comma = (i === FIELDS.length - 1) ? "" : ",";
    var spaces = new Array(pad - f.length + 2).join(" ") + " ";
    out.push("    " + f + ":" + spaces + '"' + (map[f] || "") + '"' + comma);
  });
  out.push("  },");
  out.push("");
  out.push("================================================");
  out.push("");
  out.push("Responses spreadsheet : " + ss.getUrl());
  out.push("Form (edit view)      : " + form.getEditUrl());
  out.push("Fields mapped         : " + Object.keys(map).length + " / " + FIELDS.length);
  out.push("");
  out.push("Next: paste the block above into the CONFIG section of index.html,");
  out.push("deploy, and send yourself one test response before going live.");

  var text = out.join("\n");
  Logger.log(text);
  try { DocumentApp; } catch (e) {}
  return text;
}
