# Security policy

If you find a security problem in Badgepath (https://badge-path.vercel.app) or in this repository, please report it privately through the [contact form](https://www.raynerdcunha.com/contact) and include "Security" in the subject. Please don't open a public issue for a vulnerability.

You'll get a reply as soon as I can. Please give me reasonable time to fix the problem before sharing details publicly.

Badgepath has no user accounts, no database and no cookies. It reads public GitHub data only.

## Privacy

Plain answers about what Badgepath does with your data.

- **No sign-in, cookies, analytics or ads.** The only thing saved in your browser is your light or dark theme choice (in `localStorage`).
- **The username you type** is sent to Badgepath's own API, which asks GitHub for that profile's public information. Results are kept in server memory for a short time (from seconds up to 30 days, depending on the kind of data) and are never written to a disk or a database.
- **The hosting provider keeps normal request logs.** Vercel records requests, and the address of a request includes the username that was looked up. Badgepath cannot change that. See Vercel's own privacy policy for how long those logs are kept.
- **GitHub images load straight from GitHub.** The profile photo and the badge pictures come from `avatars.githubusercontent.com` and `github.githubassets.com`, so GitHub can see your IP address and browser details for those image requests. Everything else on the page comes from Badgepath itself.
- **The profile owner is not told.** Badgepath only reads what is already public on a GitHub profile, and it does not notify anyone that a lookup happened.

## Why it is built this way

Read these before changing the headers, the API or the server code.

**Why a strict Content-Security-Policy, with no inline scripts or styles?**
The policy in `vercel.json` (and the same policy in `web/serve.js` for local use) tells the browser to load scripts and styles only from this site, and images only from this site plus the two GitHub image hosts. If a bad script were ever injected, the browser would refuse to run it. The price is that every script and style lives in its own file. Do not add `unsafe-inline` to make something work; move the code into a file instead. All page content is built with `textContent`, never `innerHTML`, so profile text from GitHub cannot become markup.

**Why is the username checked so strictly?**
Both the local server and the Vercel function check the name against GitHub's own naming rules (letters, numbers and single hyphens, up to 39 characters) before anything else happens. A name with a slash, dot, question mark or percent sign is rejected with a 400, so it can never change the address that Badgepath requests from GitHub.

**Why is there no limit on how many requests one visitor can make?**
Badgepath does not count visitors. It reacts to GitHub instead: when GitHub answers that its limit is reached (a 429 status, or a 403 with no requests remaining), Badgepath records the wait time GitHub gives and makes no more calls to that part of GitHub until then. In the meantime it serves saved results where it has them, and otherwise answers with 429 and a `Retry-After` header. Repeated lookups of the same name are served from the cache and cost GitHub nothing. The trade-off is that one heavy visitor can use up GitHub's allowance for everyone until the reset, and the host's own usage limits still apply. A `GITHUB_TOKEN` raises GitHub's allowance if that ever becomes a problem.

**Why does every request to GitHub time out after 10 seconds?**
Without a timeout, a slow GitHub could hold a request open until the platform kills it. Every outbound request goes through one helper in `server/src/github.js` that gives up after 10 seconds.

**Why does stale data expire after six hours?**
When GitHub fails, Badgepath shows the last good result instead of an error, which is friendlier. Without a limit it could show a days-old profile and look current. After six hours the request returns an error instead.

**Why can `GITHUB_TOKEN` be set, and how is it protected?**
Anonymous GitHub API access is limited to 60 requests per hour for the whole server, shared by every visitor. A token with **no scopes** raises that limit. It is read only on the server, sent only to `api.github.com`, never sent to the pages that are read as HTML, and never written to logs: errors log only their message, not the whole error object. Never put the token in `web/`, in `vercel.json` or in a commit.

**Why are errors short and generic?**
Unexpected failures return "Something went wrong." with a 500 and log only the error message on the server. Details such as file paths and library internals never reach the visitor.

**Why no CORS headers on the Vercel API?**
The page and the API share one address, so the browser never needs permission. With no `Access-Control-Allow-Origin` header, other websites cannot read the API from a visitor's browser. The local server allows only `localhost:5173` and `127.0.0.1:5173`. If you ever want another site to call the API from a browser, add the header for that one address, not `*`.

**What if a token ever ends up in a public repo?**
Removing it from the files is not enough, because it stays in Git history. Revoke it on GitHub and create a new one. Treat anything that was public once as public forever.
