# Poker Coach

Texas Hold'em No-Limit training app. Virtual chips only: no real money, no deposits, no payouts.

## Run

```bash
npm install
npm run dev        # development server
npm test           # engine, AI, storage and UI tests
npm run typecheck  # strict TypeScript
npm run build      # production build + PWA (service worker, manifest, icons)
npm run check:deploy  # is dist/ + config ready for Vercel? (run after build)
npm run preview    # serve the production build
```

## Mobile development

Open the app on your phone from ANY network (4G/5G or another Wi-Fi) through a temporary HTTPS tunnel
(Cloudflare quick tunnel). No account, no token, no router configuration, nothing to commit.

### One-time setup (Windows)

1. Install the tunnel tool. In PowerShell:

   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

2. Close and reopen the terminal (so that PATH is refreshed). If `cloudflared` is installed elsewhere, set
   `CLOUDFLARED_PATH` to its full path. The script also looks in `C:\Program Files (x86)\cloudflared` for you.

### Every time

```bash
npm run dev:tunnel
```

1. Wait for the banner:

   ```
   Poker Coach
   ────────────────────────────────────────────
   Local:
   http://localhost:5173

   Phone:
   https://xxxx.trycloudflare.com

   Open this URL on your phone.
   ```

2. Scan the QR code shown under the banner, or copy the `https://...trycloudflare.com` URL, and open it on the phone.
3. Press `Ctrl+C` in the terminal to stop the server and the tunnel. The URL changes at every launch.

### Install it as an app (PWA)

The dev server has hot reload but no service worker. To test installation and offline mode use the production build:

```bash
npm run preview:tunnel
```

Open the printed URL on the phone, then
- Android (Chrome): menu, *Install app* / *Add to Home screen*.
- iPhone (Safari): *Share*, *Add to Home Screen*.

After the first load the app works offline (every asset is precached; navigation falls back to `index.html`).

### Good to know

- The tunnel URL is public while the command runs: anyone who has the exact URL can open the app. The app has no
  backend and no account, but do not share the URL. Stop it when you are done.
- The Vite server only listens on `127.0.0.1`; your LAN and your router are not exposed.
- If the URL does not open on THIS PC (or on a phone on your home Wi-Fi) right after launch, your router's DNS has not
  learned the new name yet (common with some boxes). Use mobile data, or wait a few minutes. The script checks the
  tunnel through public DNS and tells you if this applies.
- While `dev:tunnel` runs, hot reload is wired for the tunnel (`wss` on port 443), so live reload on the PC at
  `localhost:5173` is not available; reload manually there, or use the tunnel URL on the PC too.
- Without cloudflared, `npm run dev:tunnel` prints the install steps and exits.

## Deployment (Vercel)

The app is a static single-page PWA: no backend, no database, no account, no environment variable and no secret.
Vercel only has to build it and serve `dist/` over HTTPS.

1. **Push the repository to GitHub.** (This repository has no commit yet: make the first commit, create an empty GitHub repository, then `git remote add origin <url>` and `git push -u origin master`.) `.gitignore` already excludes `node_modules`, `dist`, `.env` and `.env.*`.
2. **Import the repository in Vercel** (vercel.com, *Add New...*, *Project*, pick the repository).
3. **Let Vercel detect Vite.** The committed `vercel.json` states the same thing explicitly: framework `vite`, build command `npm run build`, output directory `dist`. Leave *Install Command* on its default and add no environment variable.
4. **Check the two fields** on the import screen: *Build Command* = `npm run build`, *Output Directory* = `dist`. `package.json` asks for Node 22.12 or newer (`engines`).
5. **Deploy.** Each push to the production branch redeploys automatically.
6. **Open the HTTPS URL on the phone.** Vercel provides the certificate; nothing to configure.
7. **Optionally install it:** Android (Chrome) menu, *Install app*; iPhone (Safari) *Share*, *Add to Home Screen*. After the first load the app also works offline.

Notes:
- There is no URL routing (the app switches screens with its own state), so no SPA rewrite is configured. Opening an unknown path such as `/foo` returns Vercel's 404; the app lives at `/`.
- Data (settings, saved ranges, session snapshot, coach preferences) stays in the browser's `localStorage` of each device. It is not shared between phone and PC and is not synchronised.
- The Cloudflare tunnel scripts (`npm run dev:tunnel`, `npm run preview:tunnel`) are development tools only; the production build does not depend on them.

Readiness check (local files only, run after `npm run build`):

```bash
npm run check:deploy
```

It verifies `vercel.json`, `.gitignore`, `dist/index.html`, the manifest and its icons, that every file precached by the service worker exists, and that nothing in `dist/` mentions `localhost`, `127.0.0.1`, a LAN address or a tunnel address. It cannot tell whether the Vercel project itself is configured: that is checked in Vercel after the import.

## Architecture

| Folder | Role | Depends on |
| --- | --- | --- |
| `src/engine` | Cards, deck, hand evaluator, game state, betting, pots, invariants. Pure TypeScript, deterministic (injected RNG). Source of truth for all poker rules. | nothing |
| `src/ai` | `DecisionProvider` interface, `SimpleBot` (hand strength + personality profile), `playBotTurn`. Swap the provider to change how bots think. | engine |
| `src/storage` | Settings and resumable session snapshot (`localStorage`, never throws). | - |
| `src/ui` | React. Design tokens, design system, cards, table, actions, game screen, app shell. Contains no poker rules: it reads engine state and sends engine actions. | engine, ai, storage |
| `src/coach/math` | Poker Math Engine: outs, probabilities, equity (exact / Monte Carlo), combos, ranges, blockers, pot odds, implied odds, SPR, EV. Pure TypeScript, public API in `src/coach/math/index.ts`. | engine |
| `src/coach` (rest) | Reserved for the coach analysis and explanations (later phases). | math |

### Range Lab and Coach foundation (Phase 5)

- `src/coach/ranges`: the 13x13 matrix model (`buildMatrix`, brushes, invert, blockers) and the preflop ranges of the five bot profiles, built from named hand groups.
  The grid never keeps its own state: a selection IS a math-engine `Range` (weighted combos); text goes through the engine parser (`parseRange`).
- `src/coach/math/multiway.ts`: `equityMultiway` (2 to 9 players, exact hands or ranges) and `equityRangeVsRange`.
  Exact enumeration when (product of combo counts) x (runouts) <= `maxExactEvaluations` (default 2,000,000), otherwise Monte Carlo with an injectable RNG/seed. Results always state the method.
- `src/coach/analysis`: `analyzeGameState(state, seat, assumptions)` returns a structured `CoachAnalysis` (situation, hand strength, draws, outs with quality, equity, pot odds, SPR, EV, blockers, confidence).
  Nothing is stated that the state or an explicit assumption cannot justify: unknown opponents give `unknown_opponent_range` / `insufficient_data`, never a guessed number.
- UI: `Ranges` tab (Range Lab) and the Coach panel (header icon during a hand; side panel on large screens).

### Explanation Engine (Phase 6)

`src/coach/explanation` turns a `CoachAnalysis` into short French sentences at three levels (Simple, Approfondi, Avancé; cumulative).
It recomputes nothing (a test scans its sources for any import of the math engine, randomness, clock or network).
Every sentence is built through a `Reader` that records the analysis paths it used (`sources`) and every figure it printed (`values`);
a sentence whose data is missing is simply not emitted. Unknown or insufficient data is stated as such, never turned into advice.
The verdict (favorable / défavorable / proche / indéterminé) is a reading of the comparison the analysis already contains.

Flow of a bot turn: `useGameSession` -> `DecisionProvider.decide()` -> `engine.applyAction()`.

### Design system

- Tokens in `src/ui/styles/tokens.css` (surfaces, text, accent/danger/gain, spacing, radius, six type sizes, motion).
- Colour has a job: accent = interaction, red = fold/loss, green = money won, surfaces = hierarchy.
- Primitives in `src/ui/design-system` (Button, IconButton, Panel, Badge, Segmented, Modal, Toast).
- Motion is short and interruptible, and disabled by `prefers-reduced-motion`.

### Sections

`src/ui/app/sections.ts` registers Play, Train, History and Profile. Only Play is built; the bottom navigation
appears automatically once a second section is marked `available`.

## Rules implemented by the engine

Blinds and button rotation (heads-up included), betting rounds, minimum raise, short all-in that does not
re-open the action, generic contribution-based side pots, uncalled-bet refunds, showdown with ties and a
deterministic odd-chip rule. See `src/engine/__tests__` for the scenarios.
