# Security review of Duo-ready 1.2.0

- Date of review: 10 October 2026
- Reviewed commit: `16bac6734ed5eba719aa9be41a46700278fb8a96`
- Earlier version in this review: 1.1.0, commit `22c39ccefcf0b96c82c785343d367908878e6b06`
- Repository: https://github.com/gurovdigital/duo-ready
- Publisher: Pavel Gurov
- Reviewer: the publisher's own review, done with an AI coding assistant. It is not an independent audit, and the section "Limits of this review" explains what this means.

## How this review was done

Version 1.1.0 was reviewed first, and that review found problems. The problems were then fixed in the code, the result became version 1.2.0, and the checks were run again on the fixed files. This report describes version 1.2.0, and for each finding it says what the state was in 1.1.0 and what the state is now.

## Scope

The review covers the skill folder `plugins/duo-ready/skills/duo-ready/`. The folder has five files and about 44 KB of text, and every file was read in full.

| File | SHA-256 of the file as it was reviewed and tested |
|---|---|
| `SKILL.md` | `92aa1684e4b644c1fbee80af49a2391ba6bbbe865dac1c09d8f951451874d6b3` |
| `scripts/duo-check.cjs` | `1514e17f9b8e0d99b7801bfafc606e08526b087860d4c8246ba3a67e4a8dc34e` |
| `scripts/duo-mockup.cjs` | `3bf403309203bcdf3f40b43d83420c9c2426bf5b527ab6b150e2a620d5e90a1a` |
| `probe/vp.html` | `876135e3e0ace086557727bed8ce0b4463c9d85ac22f0341c6a97d45b9ce1e9c` |
| `references/duo-geometry.md` | `7256cd4af73f9287431a8c1a765532103ade14a51955cb551f0d942dccb8b43a` |

In version 1.1.0 the two scripts had the names `duo-check.mjs` and `duo-mockup.mjs`, and the probe page had a second file, `probe/vp.js`. In 1.2.0 the scripts are CommonJS files with the ending `.cjs`, and the script of the probe page is inside `probe/vp.html`, so the skill folder holds no `.js` and no `.mjs` file.

The two plugin manifests (`.claude-plugin/marketplace.json` and `plugins/duo-ready/.claude-plugin/plugin.json`), `README.md`, `SECURITY.md` and `LICENSE` were also read, because they decide what an assistant installs. The plugin has no hooks, no commands, no agents and no server definitions: it contains only this one skill. The five pictures in `docs/` are outside the skill folder, and they were only checked for their file structure (each one is a plain PNG with no text blocks and no data after the end marker).

### What the skill does on a computer

An AI coding assistant reads `SKILL.md` and then runs two Node.js scripts.

- `duo-check.cjs` starts a headless Google Chrome with a new, empty profile in the temporary folder, opens each given web address at six screen sizes, and writes `duo-report.md`, `duo-report.json` and optional PNG screenshots into the folder given by `--out`.
- `duo-mockup.cjs` does the same for one address and writes one PNG file to the path given by `--out`.
- `probe/vp.html` is a static test page that shows screen measurements. The page makes no network requests and it stores nothing.

The scripts use only modules that are built into Node.js (`node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url`) and the built-in `WebSocket`. There is no `package.json`, no lock file and no npm dependency. The only other program the scripts start is Google Chrome.

## Summary

| Check | Tool or standard | Result |
|---|---|---|
| Static analysis | Semgrep 1.180.0, rule packs `p/javascript`, `p/nodejs`, `p/security-audit`, `p/secrets`, `p/owasp-top-ten` | 0 findings in 1.2.0. 130 rules ran on 5 files. The run on 1.1.0 also had 0 findings. |
| Manual review for AI-specific risks | OWASP Top 10 for LLM Applications, 2025 edition | No hidden instructions, no reading of secrets, and no code that sends data out. 11 findings in total: 8 are fixed in 1.2.0, 2 are partly fixed, and 1 is handled by the release process. |
| Dynamic tests | Node.js 25.9.0 and Google Chrome 154.0.8037.99 on macOS | 16 tests on the fixed scripts, and all of them gave the expected result. |
| Threat model | MITRE ATLAS | 12 techniques considered. The main realistic path is indirect prompt injection through text of the audited website, and 1.2.0 limits it but cannot remove it. |
| Risk review | NIST AI Risk Management Framework 1.0 | Done. |
| Malware scan | VirusTotal | 0 of 64 engines flagged the release file `duo-ready.skill` on 10 October 2026. The report is public: https://www.virustotal.com/gui/file/b70f4af66cb7fa53f6d9b67a8a0d8bb05d107653ca53d236a864079a3a8a7d98 |
| Code scanning | GitHub CodeQL | CodeQL 2.27.2 with the extended query suite, 103 rules, run by GitHub code scanning on every push. On 1.1.0 it gave 1 alert, which is finding F10 and is fixed. On 1.2.0 (commit `16bac67`) it gave 2 alerts of the rule `js/file-access-to-http` (medium), one in each script, at the line that opens the DevTools connection. Both were reviewed and closed as expected behaviour: the file that is read is `DevToolsActivePort`, which the Chrome started by the script writes into the script's own private profile folder, its content is checked against a strict pattern, and the connection goes only to 127.0.0.1 (see F3). No alert is open. |
| Release signature | Sigstore | The release workflow signs `duo-ready.skill` with keyless Sigstore (cosign) and adds a build provenance attestation. The signature bundle `duo-ready.skill.sigstore.json` is a file of the release [v1.2.0](https://github.com/gurovdigital/duo-ready/releases/tag/v1.2.0), and the signing is recorded in the public Rekor transparency log, where a search for the SHA-256 of the file gives 2 entries. To verify: `cosign verify-blob duo-ready.skill --bundle duo-ready.skill.sigstore.json --certificate-identity-regexp '^https://github.com/gurovdigital/duo-ready/' --certificate-oidc-issuer https://token.actions.githubusercontent.com`. The signature was made by the workflow and was not verified again with cosign on another computer for this report. |
| Release checksum | SHA-256 | `b70f4af66cb7fa53f6d9b67a8a0d8bb05d107653ca53d236a864079a3a8a7d98` for `duo-ready.skill` of release v1.2.0 (19,400 bytes). The archive is built with fixed timestamps and a sorted file list, so the same commit gives the same checksum. The same value is in the release file `duo-ready.skill.sha256`, and the file that was downloaded from the release for this report has this checksum. |

### Findings and their status

No critical and no high findings were found. F1 to F9 come from the manual review of 1.1.0, F10 comes from GitHub CodeQL, and F11 was found while the fixes were tested.

| ID | Severity | Finding in 1.1.0 | Status in 1.2.0 | Where in 1.2.0 |
|---|---|---|---|---|
| F1 | Medium | Text from the audited website went into the report that the assistant reads, and its length and form were not checked outside the page | Fixed in 1.2.0. The limits are now enforced in two places, and `SKILL.md` tells the assistant to treat the text as data. A text of up to 60 characters from the page still reaches the report, because showing it is part of the task. | `scripts/duo-check.cjs:82-98`, `:110-115`, `:199-200`, `:213-219`; `SKILL.md:50-52` |
| F2 | Medium | A page that did not load was reported as a pass | Fixed in 1.2.0. A network error, an answer with status 400 or higher, a failed probe and a browser that does not answer are all reported as "not checked" with exit code 1. | `scripts/duo-check.cjs:195`, `:204`, `:214-215`, `:235`, `:247`, `:254-259`; `scripts/duo-mockup.cjs:122-123` |
| F3 | Low | The Chrome debugging port was chosen from a small fixed range without checking who answers on it, and the origin check was turned off | Partly fixed in 1.2.0. Chrome now chooses a free port, the script reads the address from its own private profile folder, and the flag `--remote-allow-origins=*` is gone. Still open: while a script runs, another program on the same computer can connect to this port. | `scripts/duo-check.cjs:129`, `:154-167`; `scripts/duo-mockup.cjs:67`, `:92-103` |
| F4 | Low | Chrome and its temporary profile could stay behind when the script was stopped from outside | Fixed in 1.2.0 for `SIGTERM`, `SIGINT` and `SIGHUP`. A script that is killed with `SIGKILL` cannot clean up, and this cannot be fixed inside the script. | `scripts/duo-check.cjs:131-152`; `scripts/duo-mockup.cjs:69-90` |
| F5 | Low | `--out` and `--width` were not checked | Fixed in 1.2.0. | `scripts/duo-check.cjs:44-49`; `scripts/duo-mockup.cjs:28-29`, `:33-34` |
| F6 | Low | `SKILL.md` told the assistant to deploy and to host files without first asking the user, and its example commands did not quote the web address | Fixed in 1.2.0. | `SKILL.md:33-36`, `:104-106`, `:115-117`; `README.md:49-50` |
| F7 | Info | Chrome's own background traffic and file downloads were not turned off | Partly fixed in 1.2.0. Downloads that a page starts are now refused. Chrome's own requests to Google servers went down from 34 to 12 in a 30 second measurement, but they did not stop. | `scripts/duo-check.cjs:125-128`, `:180`; `scripts/duo-mockup.cjs:63-66`, `:109` |
| F8 | Info | Two places built HTML from text with incomplete escaping | Fixed in 1.2.0. | `probe/vp.html:125-134`; `scripts/duo-mockup.cjs:54`, `:147` |
| F9 | Info | The release tag and the commits were not signed, the plugin install was not fixed to one commit, and the repository had no `SECURITY.md` | `SECURITY.md` is added in 1.2.0. The signature and the checksum of the release are handled by the release process, and their results are in the summary table. | `SECURITY.md`; repository |
| F10 | Medium | Reported by GitHub CodeQL as `js/bad-code-sanitization`: `duo-mockup.mjs` line 60 built a piece of code from the `--scroll` value and ran it in the page | Fixed in 1.2.0. No value is placed into code text any more. The same pattern in `duo-check.mjs` was removed too. | `scripts/duo-mockup.cjs:43-53`, `:112-116`, `:125-128`; `scripts/duo-check.cjs:76-104`, `:199-200` |
| F11 | Low | Found during the tests of the fixes: a page could hold the run for a very long time, because the script waited 30 seconds for every single command when the browser did not answer | Fixed in 1.2.0. The first answer that does not come in time ends the pose, and a lost connection to Chrome ends the run. | `scripts/duo-check.cjs:172`, `:188-190`, `:235` |

### What was checked and found to be in order

- The scripts start Chrome with `spawn` and a list of arguments, and they do not use a shell (`duo-check.cjs:123-130`, `duo-mockup.cjs:61-68`). No value from the user reaches Chrome's command line: the web address is sent later through the DevTools connection (`duo-check.cjs:195`, `duo-mockup.cjs:122`), so a web address or a flag cannot add a shell command or a Chrome flag.
- Only addresses that start with `http://` or `https://` are accepted (`duo-check.cjs:43`, `duo-mockup.cjs:25`), so `file:` and `javascript:` addresses are ignored.
- The code that runs inside a page is a set of fixed functions, and every value goes to them as an argument through `Runtime.callFunctionOn` (`duo-check.cjs:76-104`, `:200`; `duo-mockup.cjs:43-53`, `:115`).
- Screenshot file names are built from the path of the address with every character other than letters and digits replaced (`duo-check.cjs:229-230`), so an address cannot make the script write outside the `--out` folder.
- Chrome runs with its own sandbox turned on, with normal certificate checks and with normal web security, because the scripts pass none of the flags that turn these off.
- Chrome uses a new profile folder made with `fs.mkdtempSync` (`duo-check.cjs:122`, `duo-mockup.cjs:60`), which only the current user can read, so the user's own cookies, logins and saved passwords are not in this browser.
- The scripts make one kind of network connection of their own, to Chrome on `127.0.0.1`. Every other request is made by Chrome.
- `SKILL.md`, `references/duo-geometry.md` and `probe/vp.html` have no HTML comments, no invisible or direction-changing characters, and no text that tells an assistant to read secrets, to change files outside the task or to send data anywhere. The Russian text in `probe/vp.html` is the visible labels of the test page.

## What changed in 1.2.0

- F1: the probe now runs in an isolated world of the page (`Page.createIsolatedWorld`), where the page cannot replace the built-in functions that the probe uses, so the limits inside the probe hold: 60 characters of text, 80 characters for the element name and at most 200 hits. After that, Node.js checks every value again: text loses control characters, line breaks, backticks, `|`, `<`, `>`, `[`, `]` and `\`, and every number is forced to be a number. `SKILL.md` says that the Element and Text columns are data and that instructions in them must not be followed.
- F2: the script reads the error text of the navigation and the status of the answer, and a pose that failed gets the words "not checked" in the terminal, in `duo-report.md` and in the `failed` field of `duo-report.json`. The report then starts with the sentence "N pose(s) could not be checked. This is not a pass." `duo-mockup.cjs` stops with exit code 1 when the page does not load.
- F3: Chrome is started with `--remote-debugging-port=0`, so it takes a free port, and it writes the port and the address of its browser endpoint into the file `DevToolsActivePort` in the profile folder. The script reads the address from this file and no longer asks a port who is there. The flag `--remote-allow-origins=*` was removed, and the connection still works, because the `WebSocket` of Node.js sends no `Origin` header. No other flag was needed in its place.
- F4: both scripts handle `SIGINT`, `SIGTERM` and `SIGHUP`. They ask Chrome to close, wait up to 3 seconds until it has closed, and then remove the profile folder. The same path is used at the normal end of a run, because the tests showed that removing the folder right after killing Chrome could leave a small folder behind.
- F5: `duo-check.cjs` stops with the usage text when `--out` has no value. `duo-mockup.cjs` accepts only 951 or 890 for `--width` and only a file name that ends in `.png` for `--out`.
- F6: the example commands put web addresses and selectors in single quotes, and `SKILL.md` says to always do so. The text now says "deploy it only when the user has asked for the deploy" and "Ask the user where to host `probe/vp.html`".
- F7: both scripts send `Browser.setDownloadBehavior` with the value `deny` right after they connect, and they start Chrome with a set of flags that turn off background work.
- F8: the probe page builds its table with `textContent`, and the label of the mockup is escaped for `&`, `<`, `>` and `"`.
- F9: the repository has a `SECURITY.md` file with the reporting address, the supported version and a link to this review.
- F10: see the section "GitHub CodeQL".
- F11: a command that gets no answer in 30 seconds ends the pose with the status "not checked", and the script goes on to the next pose.
- Other changes: the scripts are CommonJS files (`.cjs`) with one `main` function, and an error that is not handled is printed and ends the script with exit code 1 after the clean-up. The version in `plugin.json` is 1.2.0.

## Semgrep static analysis

Semgrep is a static analysis tool that searches source code for known unsafe patterns. It was run for real on the skill folder, once on version 1.1.0 and once on the fixed files of version 1.2.0.

- Version: Semgrep 1.180.0, open-source engine, not logged in, installed with `pip` into a separate Python 3.14.3 virtual environment.
- Rules: fetched from the Semgrep Registry on 10 October 2026. Registry rule packs change over time, so a later run can load a different number of rules.
- Command, run from the root of the repository:

```
semgrep scan --metrics=off \
  --config p/javascript --config p/nodejs --config p/security-audit \
  --config p/secrets --config p/owasp-top-ten \
  --json --output semgrep-results.json --verbose \
  plugins/duo-ready/skills/duo-ready
```

The same command was run a second time with `--text` in place of the JSON options.

| Item | Version 1.1.0 | Version 1.2.0 |
|---|---|---|
| Rules loaded from the five packs | 728 | 728 |
| Rules that ran | 130 (81 for JavaScript on 3 files, 1 for HTML on 1 file, 48 language-independent rules on 6 files) | 130 (81 for JavaScript on 2 files, 1 for HTML on 1 file, 48 language-independent rules on 5 files) |
| Files scanned | 6 of 6 | 5 of 5 |
| Files skipped | 0 | 0 |
| Scan errors | 0 | 0 |
| Findings | 0 | 0 |

By Semgrep's own summary, the other 598 loaded rules did not run because they are written for languages that the folder does not contain.

In 1.2.0 the script of the probe page is inside `probe/vp.html`, and Semgrep applies its JavaScript rules only to JavaScript files. So this script was also copied into a separate file outside the repository and scanned with the same five packs: 122 rules ran on 1 file, with 0 findings.

To make sure that an empty result was not caused by a broken setup, the same five packs were run on a small test file with unsafe code that is not part of Duo-ready. Semgrep reported 1 finding there (`javascript.lang.security.detect-child-process.detect-child-process`), so the scanner and the rules were working. The test file also had an `eval` call and an `innerHTML` write that these packs did not report, and Semgrep reported none of the findings F1 to F11. This shows that zero findings means "no known pattern matched" and does not mean "no problems".

## GitHub CodeQL

CodeQL is the code scanning tool of GitHub. The publisher ran it outside this review, and this report repeats the result as it was given: CodeQL 2.27.2 with the extended query suite (103 rules) on commit `22c39cc` of version 1.1.0 reported 1 open alert, `js/bad-code-sanitization`, with medium severity, at `scripts/duo-mockup.mjs` line 60. This is finding F10.

The line built a small piece of JavaScript from the `--scroll` value with `JSON.stringify` and ran it in the page. The manual review of 1.1.0 had read this line and had judged it safe, because the text was not placed into an HTML page. CodeQL is right that the pattern is weak: `JSON.stringify` is made for data and not for code, and it does not escape every character that can matter when its result is used as code.

In 1.2.0 the pattern is gone from both scripts. The code that runs in a page is now a set of fixed functions (`duo-mockup.cjs:43-53`, `duo-check.cjs:76-104`), and the `--scroll` value, the scroll positions and the width limit go to these functions as arguments of `Runtime.callFunctionOn`, so no value becomes part of code text. `duo-check.mjs` in 1.1.0 did not use `JSON.stringify` for code, but it placed numbers into code text in three places, one of them a number that came back from the page, and these places were changed in the same way.

The result of the CodeQL run on the fixed commit is in the summary table.

## Dynamic tests

The fixed scripts were run for real on 10 October 2026 with Node.js 25.9.0 and Google Chrome 154.0.8037.99 on macOS. The public website in the tests is the publisher's own site. The other pages were served by a small test server on `127.0.0.1` that is not part of Duo-ready.

| No. | Test | Result |
|---|---|---|
| 1 | `duo-check.cjs 'https://gurovdigital.com' --shots` | Six poses checked, 0 controls on the crease, `duo-report.md` and `duo-report.json` written, exit code 0. No screenshots, because screenshots are made only for hits. |
| 2 | `duo-check.cjs` on a local page with two narrow controls on the centre line, with `--shots` | 2 hits at each opened size, 4 screenshots written, exit code 1. |
| 3 | `duo-mockup.cjs 'https://gurovdigital.com'` with a label that contains `&` and `<b>` | PNG of 1820 x 1476 pixels written, and the label is shown as plain text. |
| 4 | `duo-mockup.cjs` with `--width 890 --scroll 1200`, and with `--scroll 'footer'` | Both PNG files written, exit code 0. |
| 5 | `duo-check.cjs 'https://no-such-host.invalid'` | Every pose "not checked: net::ERR_NAME_NOT_RESOLVED", the report says "6 pose(s) could not be checked. This is not a pass.", exit code 1. |
| 6 | `duo-mockup.cjs 'https://no-such-host.invalid'` | "Could not load the page", no file written, exit code 1. |
| 7 | Local pages that answer with status 404 and 403 | Every pose "not checked: HTTP 404" and "not checked: HTTP 403", exit code 1. |
| 8 | `--out` without a value (both scripts), `--out` with a `.txt` name, `--width 1200`, `--width abc`, `--width` without a value, no address | All rejected with a message and exit code 2, before Chrome starts. No file written. |
| 9 | Hostile page that replaces `JSON.stringify` to return 5000 false hits with long text and with code in the number fields | The replacement had no effect. The report shows the one real control. |
| 10 | Hostile page with instructions, Markdown and backticks in the text, the id and the class of a control, and 5001 narrow controls on the centre line | 200 hits reported at each opened size, no text longer than 60 characters, no line break, no backtick, no `|`, no brackets. The first 60 characters of the hostile text are in the report as one table cell. |
| 11 | Page that starts a file download | No file written with 1.2.0. With the 1.1.0 script the same page wrote the file into the `Downloads` folder of the user. |
| 12 | `SIGTERM` while `duo-check.cjs` runs, and while `duo-mockup.cjs` runs | Exit code 143, and afterwards 0 Chrome processes and 0 profile folders of the scripts. |
| 13 | `SIGINT` while `duo-mockup.cjs` runs, and `SIGHUP` while `duo-check.cjs` runs | Exit codes 130 and 129, and afterwards 0 Chrome processes and 0 profile folders. |
| 14 | Connection without `--remote-allow-origins` | The script connects to Chrome in every test above. During a run, Chrome listened on one port on `127.0.0.1` only, and its command line had no `--remote-allow-origins` flag. |
| 15 | Page that blocks the browser for ever | Every pose "not checked: Chrome did not answer in time", exit code 1, and the run of six poses ended after about 220 seconds. |
| 16 | Chrome's own traffic: Chrome started by hand for 30 seconds on an empty page, once with the flags of 1.1.0 and once with the flags of 1.2.0, measured with Chrome's network log | 34 requests to 14 Google host names with the flags of 1.1.0, and 12 requests to 7 Google host names with the flags of 1.2.0. |

After every test, the number of Chrome processes and of profile folders of the scripts was counted. The count was 0 every time but one: right after the four-page run of tests 7 and 9 it showed 9 Chrome processes and 1 profile folder, and both were gone at the next count. At that moment another run of `duo-check.cjs` was active on the same computer, started outside these tests, and the count cannot tell the two runs apart. The four-page run was then repeated alone, with counts from 0 to 10 seconds after its end, and every count was 0.

Two things from the tests are worth saying plainly. Test 10 shows what stays of F1: a short text from a hostile page does reach the report. Test 16 shows what stays of F7: Chrome still talks to Google servers by itself (for example an update check, a device check-in, a time check and an account check), and the flags do not stop this.

## OWASP Top 10 for LLM Applications

The OWASP (Open Worldwide Application Security Project) Top 10 for LLM (large language model) Applications, 2025 edition, was used as a checklist for the manual review. Each item below says whether it applies, what was looked at, what was found and what risk stays in version 1.2.0.

### LLM01 - Prompt injection

- Applies: yes.
- Looked at: all of `SKILL.md`, `references/duo-geometry.md`, `probe/vp.html` and the code comments, for hidden or indirect instructions; then the path from the audited website to the assistant (`duo-check.cjs:82-98`, `:110-115`, `:213-219`, `:251-267`; `SKILL.md:50-52`).
- Finding: the skill files themselves have no hidden instructions. Finding F1 is the indirect path. The script copies the text and the id and class names of each control on the centre line into `duo-report.md` and `duo-report.json`, and `SKILL.md` tells the assistant to read `duo-report.md`. In 1.1.0 the page could remove the length limit, because the probe ran among the page's own scripts. In 1.2.0 the probe runs in an isolated world and Node.js checks the result again, and tests 9 and 10 confirm that the limits hold. Screenshots carry page text to the assistant in the same way, and they cannot be cleaned.
- Residual risk: low on the user's own website, and still present on a website that the user does not control. Up to 60 characters of page text for each hit, and whatever is visible in a screenshot, reach the assistant. The sentence in `SKILL.md` asks the assistant to treat this as data, but a sentence is not a technical barrier.

### LLM02 - Sensitive information disclosure

- Applies: partly.
- Looked at: every read of files and environment variables in both scripts, and every place that writes output.
- Finding: the scripts read one environment variable, `CHROME_PATH`, and one file, `DevToolsActivePort`, which Chrome writes into the scripts' own profile folder. They do not read keys, tokens, `.env` files or browser data, and `SKILL.md` does not ask the assistant to read them. Chrome runs with an empty profile, so the report cannot contain a logged-in view of a website. The given web address is written in full into the report and printed to the terminal (`duo-check.cjs:247`, `:258`), so an address with a password or a token in it ends up in these files.
- Residual risk: low. If the assistant is told to check a page on an internal network, the screenshots and the report will contain what that page shows, and they stay in the output folder on the user's disk.

### LLM03 - Supply chain

- Applies: yes.
- Looked at: the `require` lines in both scripts, the two manifests, the installation text in `README.md`, the git tag and the commit signatures.
- Finding: there are no third-party packages. The outside parts are Node.js 22 or newer and Google Chrome, which is found at fixed system paths or through `CHROME_PATH`. Finding F9: at the time of the 1.1.0 review the tag `v1.1.0` was a lightweight tag without a signature, the commits were not signed, and `/plugin marketplace add gurovdigital/duo-ready` installs from the repository and not from one fixed commit. The release file was not downloaded and was not compared with the reviewed files.
- Residual risk: low to medium. A person who installs the skill trusts the GitHub account of the publisher. The Sigstore and SHA-256 rows in the summary table are meant to close this gap, and the file table in the section "Scope" lets a reader compare the files.

### LLM04 - Data and model poisoning

- Applies: no.
- Looked at: whether the skill trains a model, changes a model, or writes to an assistant's memory or settings.
- Finding: it does none of these. The fixed facts that the skill gives to the assistant are in `references/duo-geometry.md` and are covered under LLM09.
- Residual risk: none found.

### LLM05 - Improper output handling

- Applies: yes.
- Looked at: where text made by the assistant or by the audited page is used again: the command line, the code that runs in the page, the Markdown report and the HTML frame of the mockup.
- Finding: three weak points of 1.1.0 are fixed. Report text from the page is cleaned for Markdown (F1). The example commands quote the web address, so an assistant that copies them does not pass characters such as `&`, `;` or `$(...)` to the shell (F6). The `--label` text is fully escaped (F8). The fourth point is F10: values were placed into code text that ran in the page, and now they go in as arguments.
- Residual risk: low. The quoting in `SKILL.md` is an instruction to the assistant, and the assistant has to follow it.

### LLM06 - Excessive agency

- Applies: yes.
- Looked at: every action that `SKILL.md` asks for, and what the scripts can do with the rights of the user.
- Finding: the skill asks the assistant to run two scripts, to read the report, and to edit the stylesheet of the website. The edit is limited by clear rules: one block at the end of the stylesheet, and "Do not hide content, shrink tap targets, or change anything outside the block" (`SKILL.md:62-63`, `:88`). The skill does not ask for wider permissions, and its header does not pre-approve any tool. The two sentences of 1.1.0 that could lead an assistant to deploy a website or to publish a page without asking were changed (F6). `duo-mockup.cjs` now writes only to a path that ends in `.png` (F5), but it still replaces a PNG file that is already at that path, and `duo-check.cjs` creates any folder given by `--out`.
- Residual risk: low. The scripts can only write PNG, Markdown and JSON files, and they do not delete anything outside their own temporary folder.

### LLM07 - System prompt leakage

- Applies: no.
- Looked at: whether any file holds secrets or private instructions.
- Finding: the skill has no system prompt of its own and no secret. `SKILL.md` is public text, and the Semgrep secrets pack found nothing.
- Residual risk: none found.

### LLM08 - Vector and embedding weaknesses

- Applies: no. The skill has no search index, no embeddings and no stored memory.

### LLM09 - Misinformation

- Applies: yes.
- Looked at: how the scripts decide that a page passes (`duo-check.cjs:195-219`, `:247`, `:254-259`) and the factual statements in `SKILL.md` and `references/duo-geometry.md`.
- Finding F2: in 1.1.0 a website that was down, or that blocked headless browsers, got a check mark and exit code 0. In 1.2.0 such a page is "not checked" and the exit code is 1, and tests 5, 6, 7 and 15 confirm it. The check still does not look inside frames and shadow roots, it waits a fixed 6 seconds for each page, and a page that answers with status 200 but shows only a cookie wall or a bot check is still checked as it is.
- On the good side, the report itself says that the check ran in emulation and must be confirmed on a device (`duo-check.cjs:253`), and step 7 of `SKILL.md` tells the assistant to say the same.
- Not verified: the statements about device sizes, about browser support and about which devices the CSS width range matches. This review did not open the sources that `references/duo-geometry.md` lists.
- Residual risk: low.

### LLM10 - Unbounded consumption

- Applies: partly.
- Looked at: loops, waits and limits in both scripts.
- Finding: the work for each address has limits: six poses, at most 60 scroll steps, at most 12 screenshots for each pose, at most 200 hits for each pose, and a 30 second limit for each DevTools command (`duo-check.cjs:92`, `:112`, `:175`, `:207`, `:224`). In 1.1.0 the page controlled the number of hits, and a browser that did not answer cost 30 seconds for every command (F11). In 1.2.0 both are limited, and test 15 shows that a page that blocks the browser costs about 37 seconds for each pose. There is no limit on the number of addresses, which the user controls.
- Residual risk: low.

### Other points from the manual review

- Debugging port (F3). Chrome opens its debugging port on `127.0.0.1` only. While a script runs, any program on the same computer, also a program of another user account, can connect to this port and control this Chrome, which can read files that the user can read. This is normal for the DevTools protocol, and on a personal computer it gives other programs of the same user nothing new, but on a shared computer it matters. Version 1.2.0 removes the two details that made it weaker than it had to be: the script no longer trusts whatever program answers on a port number, and Chrome's check of the `Origin` header is on again. The port itself stays open, and only the option `--remote-debugging-pipe`, which uses no port, would close it. That change was not made, because it needs a different way of talking to Chrome.
- Temporary profile (F4). The profile folder is private and it is removed when the script ends, also after `SIGINT`, `SIGTERM` and `SIGHUP`. When the script is killed with `SIGKILL`, or when the computer loses power, Chrome and the folder can stay behind.
- Chrome's own traffic (F7). Chrome makes requests to Google servers by itself, and the flags in 1.2.0 lower the number but do not stop it. The measurement was made on an empty page and looked at request addresses only, so it does not show what these requests contain and whether they change when a website is open.
- Probe page (F8). `probe/vp.html` now writes its table with `textContent`. The `pos` value from the address is only compared with the word `sticky`.

## MITRE ATLAS threat model

MITRE ATLAS (Adversarial Threat Landscape for Artificial-Intelligence Systems) is a public list of attack techniques against AI systems. The table lists the techniques that fit a skill file of this kind. The technique numbers were written from the reviewer's knowledge of ATLAS and were not checked against the ATLAS website during this review, and ATLAS has renamed some techniques in newer releases, so a name can differ from the current one.

| Technique | How it could apply here | What prevents or limits it in 1.2.0 |
|---|---|---|
| LLM Prompt Injection, indirect (AML.T0051.001) | A website that is being checked puts instructions into link text, ids or class names, and they reach the assistant through `duo-report.md`, `duo-report.json` or a screenshot. | Only controls on the centre line are reported, at most 200 for each pose, with at most 60 characters of text, cleaned of line breaks and Markdown characters. `SKILL.md` tells the assistant to treat the text as data. Screenshots are not limited (F1). |
| LLM Prompt Injection, direct (AML.T0051.000) | `SKILL.md` is itself a set of instructions for the assistant, so a harmful version of the file would be a direct injection. | The file was read in full and has no hidden or harmful instructions. This holds only for the reviewed files. |
| LLM Plugin Compromise (AML.T0053) | An attacker who can steer the assistant uses the skill's scripts as tools: opening an address of the attacker's choice, also an internal one, or writing a PNG to a chosen path. | Only `http` and `https` addresses, no shell, an empty browser profile, downloads refused, and output limited to PNG, Markdown and JSON. `--out` of the mockup must end in `.png` (F5). |
| ML Supply Chain Compromise (AML.T0010) | The repository, the marketplace entry or the release file is changed by someone else, or `CHROME_PATH` points to a different program. | No third-party packages, and five short files that a person can read in a few minutes. The signature and the checksum of the release are in the summary table (F9). |
| User Execution (AML.T0011) | A harmful version of the skill only works after a user installs it and an assistant runs its scripts. | The plugin has no hooks and no install scripts, so nothing runs at install time. The scripts run only when the assistant starts them. |
| Command and Scripting Interpreter (AML.T0050) | The assistant builds a shell command from a web address or a selector, and special characters in it run as a command. | The scripts themselves never use a shell, and `SKILL.md` tells the assistant to put addresses and selectors in single quotes (F6). Inside the page, values are arguments and not code (F10). |
| Exfiltration via Cyber Means (AML.T0025) | An assistant that was tricked puts private data into the web address that it gives to the script, and Chrome sends it to the attacker's server when it opens the address. | The scripts send nothing by themselves and read no private files. The skill cannot stop this path, and it depends on the permission system of the assistant. This is true for every tool that opens web addresses. |
| Exfiltration via ML Inference API (AML.T0024) | Does not apply, because the skill does not offer a model interface. | - |
| LLM Data Leakage (AML.T0057) | Content of an internal page that was checked stays in the report and in the assistant's context, and the assistant repeats it later. | The empty browser profile means that no logged-in content is captured. Reports stay on the local disk. |
| Denial of ML Service (AML.T0029) and Cost Harvesting (AML.T0034) | A page returns a very large number of hits, or blocks the browser, and so uses time, memory and the assistant's context. | Fixed limits on poses, scroll steps, screenshots, hits and command time, and a pose ends at the first answer that does not come (F1, F11). Chrome is closed after a stop signal (F4). |
| Unsecured Credentials (AML.T0055) | Does not apply to the skill files: they hold no credentials and read none. | Semgrep secrets pack: 0 findings. |
| External Harms (AML.T0048) | A wrong "all clear" leads a website owner to ship a page that does not work on the device. | The report and `SKILL.md` both say that the result comes from emulation, and a page that failed to load is reported as "not checked" (F2). |

One risk has no good match in ATLAS and is named here without a number: local access to the unauthenticated Chrome debugging port while a script runs (F3).

## NIST AI RMF risk review

The NIST AI RMF (National Institute of Standards and Technology Artificial Intelligence Risk Management Framework), version 1.0, sorts risk work into four functions, and the review follows them.

### Govern

- Responsible person: Pavel Gurov, who is the author and publisher named in `plugin.json`, in `marketplace.json` and in `LICENSE`. There is no other maintainer.
- Licence: MIT, which gives the software without warranty.
- Reporting address: pavel@gurovdigital.com, which is now also in `SECURITY.md` at the root of the repository.
- Supported version: the latest release only.

### Map

- Who uses it: a person who works on a website, through an AI coding assistant, or directly from the command line.
- What the skill touches: the websites at the given addresses (it reads them with a headless Chrome), the temporary folder (a browser profile that is removed at the end), the output folder (reports and PNG files), one port on `127.0.0.1` while a script runs, and the stylesheet of the user's own website, which the assistant edits by the rules in `SKILL.md`.
- What it does not touch: user accounts, cookies and passwords of the user's own browser, keys and tokens, and any server of the publisher. The skill has no telemetry of its own. Chrome makes its own requests to Google servers (F7).
- Who can be harmed and how: the user, if a hostile website steers the assistant through page text or a screenshot (F1), or if another local user of a shared computer reaches the debugging port while a script runs (F3).

### Measure

- Static analysis with Semgrep 1.180.0 on 1.1.0 and on 1.2.0: 130 rules each time, 0 findings each time.
- GitHub CodeQL on 1.1.0, run by the publisher: 1 alert, which is F10.
- Manual review of all files against the OWASP Top 10 for LLM Applications, 2025 edition: 9 findings in 1.1.0.
- Dynamic tests of 1.2.0 with a real Chrome: 16 tests, which found one more problem (F11) and one weakness in the first version of a fix (F4), and both were corrected before the final test run.
- Threat model with MITRE ATLAS: 12 techniques considered.
- Search of all text files for invisible characters, HTML comments and instruction-like text: nothing found.
- Checks run outside this review: the VirusTotal scan, GitHub CodeQL on the fixed commit, the Sigstore signature and the SHA-256 checksum, and their results are in the summary table.

### Manage

- State of the findings: 8 of 11 are fixed in 1.2.0, F3 and F7 are partly fixed, and F9 is handled by the release process. The table "Findings and their status" says what is still open.
- How a problem is reported: by email to pavel@gurovdigital.com, with the version or the commit and the steps that show the problem.
- How a fix is released: the fix is a new commit, the `version` field in `plugin.json` gets a higher number, a new tag and a new release file are published, and the checks in this report are run again on the new commit. Version 1.2.0 was made in this way from the findings of the 1.1.0 review.
- How a user gets the fix: by updating the plugin from the marketplace, or by copying the skill folder again from the new release.
- What a user can do: use the skill on websites that the user controls, give `--out` a new folder inside the project, and not run the scripts on a computer that is shared with people the user does not trust.

## What is still open in 1.2.0

- F1: a short text from the audited page, and everything that a screenshot shows, reach the assistant. This is part of what the skill does.
- F3: the Chrome debugging port is open to other programs on the same computer while a script runs. A change to `--remote-debugging-pipe` would close it.
- F4: after `SIGKILL` or a power loss, Chrome and its profile folder can stay behind.
- F7: Chrome makes about 12 requests of its own to Google servers in the first 30 seconds of a run.
- F9: whether the release is signed and has a published checksum is shown in the summary table and not in the code.
- LLM09: frames and shadow roots are not checked, and a page that shows only a cookie wall or a bot check with status 200 is checked as it is.

## Limits of this review

- The review was done by the publisher with an AI coding assistant. The publisher reviewed his own work and also wrote the fixes, so this is not an independent audit, and no outside security company or outside person checked the result.
- What was tested by running the code: the 16 tests in the section "Dynamic tests", on one computer, with Node.js 25.9.0, Google Chrome 154.0.8037.99 and macOS. Node.js 22, which is the oldest version that the skill names, Linux and Windows were not tested.
- What was not tested by running the code: the probe page `probe/vp.html` on a phone or in an in-app browser, a real attack through the debugging port, the behaviour of the scripts with an assistant in the loop, and whether an assistant follows the new sentences in `SKILL.md`.
- The public website in the tests has no controls on the crease, so the screenshot path was tested only with a local test page.
- The measurement of Chrome's own traffic lasted 30 seconds on an empty page and looked at request addresses only.
- The skill itself works by emulation in desktop Chrome. Nothing in this review was tested on a real device.
- Semgrep ran with the free registry rule packs only, and the test in the Semgrep section shows that these packs do not report every unsafe pattern. The CodeQL run was done by the publisher outside this review.
- The rows for VirusTotal, GitHub CodeQL, Sigstore and SHA-256 in the summary table were filled in after the release of v1.2.0, from the results of those services. The other GitHub settings of the repository were not checked.
- The factual statements in `references/duo-geometry.md` and the technique numbers of MITRE ATLAS were not checked against their sources.
- The review covers the files with the SHA-256 values in the section "Scope". Any later change to the files is not covered.

## How to report a problem

Write to pavel@gurovdigital.com. Please name the version or the commit, say which file and line the problem is in, and give the steps that show it. Please do not open a public issue for a problem that other people could misuse before a fix is released.
