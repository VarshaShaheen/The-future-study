/** Paste this file into Extensions → Apps Script in your existing Sheet.
 * Run setupSheet once, then deploy as a Web app (execute as Me; access Anyone).
 * Keep the Sheet private. See docs/SHEETS-SETUP.md for Vercel configuration.
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

function setupSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Open this script from your Google Sheet.");
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty("SPREADSHEET_ID", spreadsheet.getId());
  if (!properties.getProperty("SUBMISSION_TOKEN")) {
    properties.setProperty("SUBMISSION_TOKEN", Utilities.getUuid() + Utilities.getUuid());
  }
  var sheet = spreadsheet.getSheetByName("Study Responses") || spreadsheet.insertSheet("Study Responses");
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FIELDS.length).setFontWeight("bold");
  }
  checkHeaders(sheet);
  Logger.log("Ready. In Project Settings → Script properties, copy SUBMISSION_TOKEN into the Vercel environment variable GOOGLE_SCRIPT_TOKEN.");
}

function checkHeaders(sheet) {
  if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, FIELDS.length).getValues()[0]) !== JSON.stringify(FIELDS)) {
    throw new Error("Response column headers do not match. Do not reorder or rename them.");
  }
}

function jsonResult(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

// Called only while holding the script lock. Keep all four slots in the Sheet
// so a failed response/retry cannot consume a second slot or reshuffle a block.
function assignParticipant(properties, participantId) {
  var spreadsheet = SpreadsheetApp.openById(properties.getProperty("SPREADSHEET_ID"));
  var sheet = spreadsheet.getSheetByName("Study Assignments") || spreadsheet.insertSheet("Study Assignments");
  var headers = ["participant_id", "condition", "block", "assigned_at"];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 4).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  if (JSON.stringify(sheet.getRange(1, 1, 1, 4).getValues()[0]) !== JSON.stringify(headers)) {
    throw new Error("Assignment headers do not match.");
  }
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
  var existing = rows.filter(function(row) { return row[0] === participantId; })[0];
  if (existing) return existing[1];
  var available = rows.findIndex(function(row) { return row[0] === ""; });
  var condition;
  if (available !== -1) {
    condition = rows[available][1];
    sheet.getRange(available + 2, 1, 1, 4).setValues([[participantId, condition, rows[available][2], new Date().toISOString()]]);
  } else {
    var block = ["control", "control", "treatment", "treatment"];
    for (var i = block.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = block[i]; block[i] = block[j]; block[j] = swap;
    }
    condition = block[0];
    var blockNumber = rows.length / 4 + 1;
    var newRows = block.map(function(arm, index) {
      return [index === 0 ? participantId : "", arm, blockNumber, index === 0 ? new Date().toISOString() : ""];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 4, 4).setValues(newRows);
  }
  SpreadsheetApp.flush();
  return condition;
}

function doPost(event) {
  var lock;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > 22000) return jsonResult({ok:false});
    var request = JSON.parse(raw);
    var properties = PropertiesService.getScriptProperties();
    var expectedToken = properties.getProperty("SUBMISSION_TOKEN");
    if (!expectedToken || request.token !== expectedToken) return jsonResult({ok:false});
    var payload = request.payload;
    if (request.action === "assign") {
      if (!payload || !/^P-[A-Z0-9-]{8,80}$/.test(payload.participant_id || "") || payload.consent !== "Yes") {
        return jsonResult({ok:false});
      }
      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      var condition = assignParticipant(properties, payload.participant_id);
      return jsonResult({ok:true, participant_id:payload.participant_id, condition:condition});
    }
    if (request.action) return jsonResult({ok:false});
    if (!payload || !/^P-[A-Z0-9-]{8,80}$/.test(payload.participant_id || "") ||
        ["control", "treatment"].indexOf(payload.condition) === -1 || payload.consent !== "Yes") {
      return jsonResult({ok:false});
    }
    var row = FIELDS.map(function (key) {
      var value = payload[key];
      if (value === undefined || value === null) return "";
      if (typeof value !== "string" && typeof value !== "number") throw new Error("Invalid value");
      value = String(value);
      if (value.length > 1000) throw new Error("Value too long");
      // Store free text literally rather than executing spreadsheet formulas.
      return /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    });
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    var sheet = SpreadsheetApp.openById(properties.getProperty("SPREADSHEET_ID")).getSheetByName("Study Responses");
    checkHeaders(sheet);
    // The lock makes simultaneous retries for one participant idempotent.
    var existing = sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(payload.participant_id).matchEntireCell(true).useRegularExpression(false).findNext();
    if (!existing) {
      sheet.appendRow(row);
      SpreadsheetApp.flush();
    }
    return jsonResult({ok:true, participant_id:payload.participant_id});
  } catch (error) {
    return jsonResult({ok:false});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
