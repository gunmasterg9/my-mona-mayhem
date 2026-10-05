# Copilot instructions

## Build and run

- Install dependencies with `npm ci`.
- Run the Astro app locally with `npm run dev`.
- Build the app with `npm run build`; preview a production build with `npm run preview`.
- `package.json` has no test or lint scripts, and the repository has no configured test runner.

## Architecture

- This repository has two related but separately served parts: the Astro game app under `src/`, and the static workshop website under `docs/` with its Markdown source in `workshop/`.
- Astro's file-based routes define the app. `src/pages/index.astro` contains the battle UI and its client-side TypeScript; `src/pages/api/contributions/[username].ts` is the server endpoint that fetches GitHub's `https://github.com/{username}.contribs` data.
- The browser should request contribution data through `/api/contributions/{username}` rather than calling GitHub directly. The API response includes totals, date range, weeks, and contribution colors used by the page.
- `astro.config.mjs` configures server output with the standalone `@astrojs/node` adapter. The GitHub Pages workflow currently copies `docs/` and localized workshop content only; it does not deploy the Astro app or its API.
- Workshop instructions are maintained in English, Spanish (`workshop/es/`), and Brazilian Portuguese (`workshop/pt_BR/`). Keep corresponding localized steps aligned when changing workshop content.

## Repository conventions

- Keep Astro page markup, page-scoped styles, and client behavior together in the existing page unless there is a clear need to share or extract them.
- Preserve the API/UI response contract: contribution data uses upstream-style fields such as `total_contributions`, while the page also accepts `totalContributions`; update both sides together when changing the shape.
- API errors are JSON objects with an `error` field and an appropriate HTTP status. Keep upstream fetching and its error handling in the server route.
- The game page uses a dark arcade palette with CSS custom properties; extend its existing variables and responsive styles when changing the game UI. The workshop site's styling is separate under `docs/`.
- TypeScript uses Astro's strict configuration from `astro/tsconfigs/strict`.
