# The Future Study

*Whose Future Are You Saving For?*

A randomised between-subjects experiment on green deposit choice.
Participants allocate a hypothetical ₹10,00,000 before and after an
information intervention; everyone sees the text screen, and treatment
participants then see a separate video screen. New participants are assigned
centrally after consent in shuffled blocks of four (two per condition).

Custom front-end, Google Sheets backend through Apps Script and a Vercel function.
No frontend build step.

The initial profile keeps age, education, income, gender, employment, district,
and investment experience together. From Round 2 onward, each screen presents
one question. Treatment has one additional video screen. Saved sessions resume by screen ID, with
compatibility for the previous grouped-screen layout.

## Quick start

```bash
npm run dev       # http://localhost:3000
npm run deploy    # vercel --prod
```

## Layout

```
index.html          the experiment, animated woodland SVG, and config block
styles/experience.css  woodland theme, tree/leaf animations, reduced-motion support
assets/             solar-energy.jpg, forest-river.jpg, PHOTO-CREDITS.md
api/responses.js    server-side submission relay
api/assignment.js   server-side balanced assignment relay
tools/sheets-backend.gs  paste into your Sheet’s Apps Script project
docs/SHEETS-SETUP.md  connection and deployment instructions
tests/sheets-saving.cjs  relay and mocked Sheet verification
tests/assignment.cjs  balanced allocation, retries, and failure checks
```

`tools/` and `docs/` are excluded from deploys via `.vercelignore`.

## Before you launch

Follow [docs/SHEETS-SETUP.md](docs/SHEETS-SETUP.md) to connect your existing Google
Sheet, deploy Apps Script, and set `GOOGLE_SCRIPT_URL` and `GOOGLE_SCRIPT_TOKEN`
in Vercel. The Sheet stays private. No Google Form is needed.

Assignment and saving are not active until those deployment steps are complete. The website
shows success only after receiving a matching participant-ID acknowledgment.
Retries do not duplicate rows. Test both conditions and verify the rows before
collecting participant data. The previous Forms setup files are legacy only.

`npm run dev` previews the static UI only. For the backend, use `npx vercel dev`
with local environment variables (see `.env.example`). Run `node
tests/sheets-saving.cjs` for local relay and Apps Script mock checks.

## Preview flags

| URL | Effect |
|---|---|
| `?c=control` | Force the control arm |
| `?c=treatment` | Force the treatment arm |
| `?reset=1` | Clear this browser's "already participated" flag |

## Assets

Treatment uses locally hosted photographs configured by `CONFIG.ASSETS.solar`
and `CONFIG.ASSETS.water`. Credits and source links are in
[assets/PHOTO-CREDITS.md](assets/PHOTO-CREDITS.md).

From the information screen onward, the shared animated woodland is hidden for
both groups. The control information screen contains only the shared explanatory
text; treatment adds photographs with captions. Photographs are not inserted or
requested by the control screen. These are illustrative real places, not a
before/after comparison or documented outcomes of a particular green deposit.

## Data

Responses land in the `Study Responses` tab, with one column per field in
`tools/sheets-backend.gs`. Key derived fields:
`condition`, `q5_choice_round1`, `q6_choice_round2`, `switch_category`,
`switched`, and `time_intervention_s` (your manipulation check — a treatment
respondent who spent 1.4s on that screen never looked at the visualisation).

Participant data is gitignored (`responses/`, `*.csv`, `*.xlsx`). Keep it that way.
