# Whose Future Are You Saving For? — setup guide

A custom experiment front-end that writes into a Google Form, so your data
lands in a normal Google Sheet you can export to R / SPSS / Stata.

**Files**

| File | What it is |
|---|---|
| `index.html` | The whole experiment. Self-contained, no build step. |
| `setup.gs` | Google Apps Script that builds the Form + Sheet and prints your config. |
| `entry-ids.html` | Manual fallback if you build the Form by hand. |

---

## Step 1 — Build the backend (about 2 minutes)

1. Go to **script.google.com** → **New project**
2. Delete the placeholder code, paste all of `setup.gs`
3. Press **Run** ▶ and authorise it (it's your own script in your own account —
   click *Advanced → Go to project → Allow* past the "unverified" warning)
4. Open the **Execution log**

It creates the Google Form, creates a linked response Spreadsheet, and prints a
finished `FORM_ID` + `ENTRY` block.

**Why every field is a "Short answer" question:** a multiple-choice question in
Google Forms silently rejects the entire submission if a value doesn't match one
of its options character-for-character. One stray en-dash and you lose the
response with no error. Short answer accepts any string, so nothing is ever lost.

---

## Step 2 — Paste the config

Open `index.html`, find the block marked `██ CONFIG — EDIT THIS BLOCK ONLY ██`
near the top of the first `<script>`, and replace `FORM_ID` and `ENTRY` with what
the log printed.

While you're in there:

```js
DISTRICTS: [ ... ]        // swap in your sampling frame (currently Kerala's 14)
TREATMENT_SHARE: 0.5      // 50/50 assignment
BLOCK_REPEAT: true        // one response per browser
```

---

## Step 3 — Add your before/after visuals

Drop your rendered files next to `index.html` and name them in `CONFIG.ASSETS`:

```js
ASSETS: {
  before: "river-before.jpg",     // .jpg .png .webp .mp4 .webm all work
  after:  "river-after.jpg",
  beforeAlt: "…",                 // alt text, please keep these meaningful
  afterAlt:  "…"
}
```

Left as `null`, the treatment screen falls back to a built-in illustrated
river so you can pilot the flow before the assets exist.

**Asset notes for a clean experiment**

- Shoot/render both panels from the **identical camera and framing**. If the
  "after" is a different composition, you're manipulating scene as well as
  condition and the effect is no longer clean.
- Keep both files **similar in size**. If "after" is a 4 MB video and "before"
  is a 90 KB JPG, slow connections see them at different times and load order
  becomes a confound.
- Panels are displayed at **4:3**. Export at that ratio, around 1200×900, or
  they'll be cropped.
- If you use video, keep it short and silent — it's set to autoplay, loop and
  mute, which is the only combination mobile browsers allow without a tap.

---

## Step 4 — Deploy

Any static host. Since you already run Vercel:

```bash
npx vercel --prod        # from the folder containing index.html
```

Or drag the folder onto **vercel.com/new**. You'll get a link like
`whose-future.vercel.app` to send out.

Do **not** send people the Google Form link — that's the raw data sink.

---

## Step 5 — Pilot before you go live

Preview either arm without burning a real response:

| URL | What it does |
|---|---|
| `?c=control` | Force the control screen |
| `?c=treatment` | Force the treatment screen |
| `?reset=1` | Clear this browser's "already participated" flag |

Run through both arms, then check the Sheet. Before you send the link to anyone:

- [ ] Both arms wrote a row
- [ ] `switch_category` and `switched` are populated
- [ ] `condition` shows both values across your test rows
- [ ] Your before/after assets load on **mobile data**, not just wifi
- [ ] Delete the pilot rows from the Sheet

Then **stop editing the Google Form.** Renaming or reordering questions after
this point changes the entry IDs and silently breaks collection.

---

## What lands in your Sheet

35 columns. The ones that aren't just question answers:

| Column | Meaning |
|---|---|
| `participant_id` | Unique per respondent, for deduping |
| `condition` | `control` or `treatment` — your independent variable |
| `q5_choice_round1` | Choice **before** the intervention |
| `q6_choice_round2` | Choice **after** the intervention |
| `switch_category` | `Conventional → Green`, `Green → Green`, etc. |
| `switched` | `Yes` / `No` |
| `final_choice` | Round 7, after all the attitude questions |
| `time_round1_s` | Seconds spent deciding in Round 1 |
| `time_intervention_s` | **Seconds spent on the intervention screen** |
| `time_round2_s` | Seconds spent deciding in Round 2 |
| `time_total_s` | Whole session |
| `started_at` / `submitted_at` | ISO timestamps |

`time_intervention_s` is worth more than it looks. It's your manipulation check:
a treatment respondent who spent 1.4 seconds on that screen didn't look at the
visualisation, and you'll want that as an exclusion criterion you declared in
advance rather than one you discovered in the data.

---

## Analysis notes

Your core test is **condition × switched** — a 2×2 chi-square (or Fisher's exact
if any cell is thin). That answers "did the visualisation move people?"

Two things worth planning now rather than later:

- **The floor and ceiling problem.** Anyone who picked Green in Round 1 *cannot*
  switch to Green. Your treatment effect really only operates on the
  Conventional-in-Round-1 subgroup, so report that conditional rate alongside the
  overall one. If green uptake in Round 1 is very high, your usable N shrinks
  fast — worth watching in the first 50 responses.
- **Demand effects.** Asking the same question twice, 20 seconds apart, with an
  obviously pro-green message in between, tells participants what you want. Some
  switching will be politeness rather than preference. `final_choice` in Round 7
  is your partial defence — a switch that survives to the end is more credible
  than one that doesn't — so treat the Round 1 → Round 7 comparison as a
  robustness check on the headline result.

For the moderation question you mentioned — whether people who've seen real river
pollution respond differently to the visualisation — that's `condition ×
q15_observed_pollution` on switching. Powering an interaction takes roughly four
times the sample of a main effect, so with 500 you'll detect a large interaction
and not much else. Worth pre-registering as exploratory.

---

## Known limitations

- **Submission can't be confirmed.** Google blocks reading the response, so the
  page assumes success unless the request throws. It retries four times, then
  saves the response locally and sends it automatically the next time that person
  opens the link, and offers a manual download as a last resort. In practice
  losses are rare, but reconcile your Sheet row count against your recruitment
  count rather than assuming they match.
- **`BLOCK_REPEAT` is a soft lock.** It's a localStorage flag — a different
  browser, incognito, or a cleared cache gets through. Fine for honest
  volunteers, not a defence against a determined duplicate. `participant_id`
  plus timestamps will help you spot the obvious ones.
- **No partial responses.** Nothing is written until the last screen, so
  drop-offs leave no trace in the Sheet. Progress is saved in the browser, so
  someone who closes the tab and returns resumes where they left off.
