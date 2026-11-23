# 🏅 Badgepath

**Track your GitHub achievements. Discover your progress. Reach the next tier.** 🚀

Badgepath is a lightweight GitHub achievement tracker. Enter a GitHub username or profile URL to explore earned achievements, estimated progress, profile statistics, and the public activity behind selected badges.

> Badgepath uses publicly available GitHub profile information. No GitHub login or account connection is required.

## ✨ Features

- **Achievement overview** — displays the achievements visible on a public GitHub profile.
- **Tier progression** — tracks Default, Bronze, Silver, and Gold tiers where GitHub provides measurable thresholds.
- **Progress timelines** — shows current counts, the next target, and how much remains.
- **Official award status** — keeps estimated progress separate from the badge GitHub actually displays.
- **Achievement history** — shows available unlock dates and public pull-request events.
- **Profile statistics** — includes public repositories, followers, contributions, and contribution streaks.
- **Repository insights** — highlights top repositories and language distribution.
- **Profile highlights** — displays supported GitHub profile highlights separately from achievements.
- **Live refresh** — periodically refreshes the profile data, with a pause control.
- **Light and dark themes** — switch with the theme button; your choice is remembered in the browser.
- **Responsive interface** — works on desktop and mobile, with a print-friendly layout.

## Interface

The landing page lets you search by GitHub username. A profile page presents the account summary, statistics, achievement progress cards, and additional profile information.

## 🖥️ Run locally

### 📋 Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- Internet access to retrieve public GitHub data

There are no third-party npm dependencies.

### 🪟 Windows

Double-click `start.bat`. It starts the API and web server and opens the site in your browser.

### 💻 Any operating system

From the project root, run:

```bash
node run-all.js
```

Then open:

```text
http://localhost:5173
```

Press `Ctrl+C` in the terminal to stop both processes.

### 🔧 Run the servers separately

Open two terminal windows from the project root.

Terminal 1 — API:

```bash
node server/server.js
```

Terminal 2 — web page:

```bash
node web/serve.js
```

The API listens on `http://localhost:3001` and the web page listens on `http://localhost:5173`.

## ⚙️ Configuration

The application works without a `.env` file.

To customize the local API, copy `server/.env.example` to `server/.env` and change the values as needed:

| Variable | Default | Description |
|---|:---|---|
| `PORT` | `3001` | Port used by the local API server |
| `ALLOWED_ORIGINS` | `http://localhost:5173`<br>`http://127.0.0.1:5173` | Browser origins allowed to call the local API, separated by commas |
| `RATE_LIMIT` | `60` | Maximum API requests per address per minute |

Environment variables already set by the hosting environment take precedence over values in `server/.env`.

### 🔑 Optional GitHub token

For a public deployment, you can set `GITHUB_TOKEN` to a GitHub personal access token with **no additional scopes**. This can increase the GitHub API rate limit available to the server.

Keep the token in the server environment. Never put it in frontend files or commit it to the repository.

## 🚀 Deploy to Vercel

The repository includes `vercel.json` and the serverless API function in `api/`.

1. Push the project to GitHub.
2. Import the repository into [Vercel](https://vercel.com/) and choose a project name (it becomes `<name>.vercel.app`).
3. Leave every setting at its default: no Root Directory, no Output Directory override.
4. Deploy. `vercel.json` publishes `web/` and runs the API from `api/`.

The Vercel configuration serves the static frontend from `web/` and exposes the API through `/api/badges`.

### 🌐 Deployment settings

The page and the API are served from the same Vercel address, so no CORS or origin setting is needed.

You may add `GITHUB_TOKEN` as a Vercel environment variable if GitHub's anonymous rate limit becomes a problem. Do not expose it to the browser.

## 🔌 API

### `GET /api/badges`

Looks up a GitHub user and returns profile, achievement, statistics, and repository data.

Example:

```text
/api/badges?user=octocat
```

The username must be a valid GitHub username.

### `GET /api/health`

Returns a simple health response:

```json
{"ok":true}
```

## 🔍 How it works

1. The browser accepts a username, `@username`, or GitHub profile URL.
2. The frontend requests `/api/badges?user=<username>`.
3. The API reads the public GitHub profile to identify achievements and profile highlights.
4. It retrieves public profile, repository, pull-request, and contribution information from GitHub.
5. The frontend compares available counts with the thresholds in `web/badges.json`.
6. The dashboard displays estimated progress alongside the achievement status GitHub actually shows.

Achievement artwork is loaded from GitHub's asset CDN, so an internet connection is required.

## 🏆 Achievement coverage and limitations

- Progress can only be calculated for achievements with a usable public count.
- **Pair Extraordinaire** and **Quickdraw** cannot be reliably counted from public data; they are displayed when GitHub awards them.
- **Galaxy Brain**, **Public Sponsor**, and other achievements without a public count do not receive a numeric progress estimate.
- A profile with hidden achievements may appear to have none.
- Public profile data does not include activity from private repositories.
- GitHub may take time to update an achievement after its requirements have been met.
- Progress indicators are estimates, not a guarantee that GitHub will award a badge.
- GitHub can change its page structure, API behavior, or rate limits. Such changes may affect data retrieval.
- Retired achievements are identified in the catalogue. Achievements not included in `web/badges.json` are not displayed.

## 📁 Project structure

```text
badge-path/
├── api/
│   ├── badges.js          # Vercel serverless badge lookup endpoint
│   └── health.js          # Vercel health endpoint
├── server/
│   ├── server.js          # Local HTTP API server
│   ├── .env.example       # Optional local configuration example
│   ├── src/
│   │   ├── cache.js       # In-memory response cache
│   │   ├── github.js      # GitHub data retrieval and parsing
│   │   └── ratelimit.js   # Per-address request limiter
│   └── test/              # API and utility tests (github, server, fixes)
├── web/
│   ├── index.html         # Frontend page
│   ├── app.js             # Search, rendering, and progress logic
│   ├── style.css          # Interface styling
│   ├── config.js          # Frontend runtime configuration
│   ├── badges.json        # Achievement catalogue and tier thresholds
│   ├── logo-*.png/.svg     # Logos for the light and dark themes
│   ├── favicon-64*.png    # Browser tab icons (dark and light)
│   └── serve.js           # Local static web server
├── .gitattributes         # Keeps line endings consistent (LF)
├── run-all.js             # Starts the local API and web servers
├── start.bat              # Windows launcher
├── package.json
└── vercel.json            # Vercel deployment configuration
```

## 🧪 Tests

Run the test suite from the project root:

```bash
npm test
```

`npm test` runs `node --test "server/test/*.test.js"`. Use that exact pattern if you run the tests directly, because pointing `node --test` at the `server/` folder can hang on newer Node versions.

The tests cover GitHub page parsing, contribution streak calculations, caching, rate limiting, request validation, CORS behavior, and API responses.

## 🔒 Privacy and security

- No GitHub login is requested.
- The application looks up public GitHub information only.
- The local API binds to `127.0.0.1`.
- The local API validates usernames, checks browser origins, and applies a per-address rate limit.
- The local web server serves an explicit allowlist of frontend files.
- Security headers (Content-Security-Policy and others) are sent by the local web server and by Vercel through `vercel.json`.
- The Vercel API applies a per-address rate limit, and requests to GitHub time out after 10 seconds.
- Any optional GitHub token belongs in server-side environment variables only.

## 🙌 Credits

Created by **Rayner Dcunha**.

Badgepath is an independent project and is **not affiliated with, endorsed by, or sponsored by GitHub**. GitHub and GitHub achievement names and artwork are the property of their respective owners.