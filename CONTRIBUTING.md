# Contributing

Badgepath is a personal project, so I'm not looking for big feature changes. Fixes are welcome:

- Typos, broken links and accessibility problems.
- Bugs in the server or the page, with steps to reproduce.
- Achievement thresholds in `web/badges.json` that GitHub has changed.

Open an issue first for anything bigger than a small fix. Keep changes small, keep the project free of npm dependencies and build steps, and don't add requests to other websites, since the Content-Security-Policy only allows this site's own files and the two GitHub image hosts.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and the [Notice](NOTICE.md) on what the license covers. Security and privacy choices are explained in [SECURITY.md](SECURITY.md).

## Run it and test it

```bash
node run-all.js
npm test
```

`npm test` lists the test files one by one on purpose. Node's test runner only understands patterns like `server/test/*.test.js` from Node 21 onwards, so a pattern would fail on Node 20. When you add a test file, add it to the `test` script in `package.json`.

## How the project is built

Plain answers to "why is it built this way?" and "how was this problem handled?".

**Why no dependencies?**
Nothing needs installing, nothing needs updating, and there is no package that could be hijacked. The browser and Node run exactly the files in the repo.

**Why does the page read HTML as well as the GitHub API?**
GitHub has no public API for achievements. The profile page and the achievement pages are the only public source, so `server/src/github.js` reads them and checks the shape of what it finds. If GitHub changes a page, the parser returns nothing instead of wrong numbers. Parser tests live in `server/test/github.test.js`.

**Why do the local server and the Vercel function share one lookup?**
`server/server.js` and `api/badges.js` both call `lookup()` in `server/src/github.js`, so the numbers are identical. Both also use the same username check and the same rate limiter, so keep those in step if you change one.

**Why does the cache keep old results?**
If GitHub is down, a recent result is more useful than an error. It is capped at six hours (`maxStaleMs` in `server/src/cache.js`). After a failure the server also waits a minute before asking GitHub again, so a broken request cannot hammer GitHub.

**Why are progress numbers called estimates?**
Some achievements cannot be counted from public data. The README lists them. The page shows what GitHub has awarded separately from Badgepath's own estimate.

### Search and AI discovery

**Why `robots.txt` and structured data?**
They tell search engines what the site is. The home page names its preferred address (canonical) and carries a short description and structured data. `/api/` is closed to crawlers because it only returns data. Keep the description near 155 characters, because search engines cut it off.

### Accessibility

**Why does the page respect "reduce motion"?**
Some people get dizzy from animation and their system lets them ask for less. The stylesheet turns animation off for them.

### Repository

**Why is there a separate `NOTICE.md`?**
GitHub recognises the license by comparing the file with the standard MIT text, so `LICENSE.md` stays plain. What the license does not cover (the logo and GitHub's artwork) is explained in `NOTICE.md`.

**Why do the repo-only files stay out of the deployed site?**
`.vercelignore` lists the tests, the community files and `.github/` so they are not uploaded with the deployment.

### Quick re-check after any change

1. `npm test` passes.
2. The home page and a profile such as `/torvalds` load with no broken images.
3. `/api/badges?user=bad..name` and `/api/badges?user=octocat&x=1` return 400, `/api/health` returns 200, and an unknown path such as `/api/nope` returns a JSON 404.
4. `/robots.txt` and `/.well-known/security.txt` open as plain text.
5. The page still carries the Content-Security-Policy header and works with it.
