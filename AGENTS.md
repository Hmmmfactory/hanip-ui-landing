# B01 local editorial console

When the user refers to 편집실, 블로그 관리 화면, or its role agents, use the shared local console. It reads the real `story/posts.json`, `story/ideas.md`, and optional `story/drafts/*.md` files. The console's task history is separate from the Codex desktop conversation history.

- Start if needed: `node local-console/server.mjs` (keep the process running).
- Read status and task results: `node local-console/cli.mjs status`.
- Send a user-requested task: `node local-console/cli.mjs send editor "명령"`. Roles: `editor`, `writer`, `seo`, `publisher`.
- Commands default to read-only. Append `--write` only when the user has requested file creation or edits.
- Cancel: `node local-console/cli.mjs cancel TASK_ID`.
- Only delegate tasks the user requests. Do not recursively submit console jobs from inside a console agent run.
- Never edit `.editorial-console/tasks.json` directly while the server is running. Use the CLI/API.
- Local registered posts and prepared HTML do not prove public deployment. Verify the remote page before reporting public publication.
- Keep `.editorial-console/` and `local-console/` out of public deployments. Never print connection tokens or authentication files.

For blog writing or publishing, apply `.agents/skills/runday-seo/SKILL.md` and `story/brand.md`.

## Weekly workflow and human questions

- Inspect plans: `node local-console/cli.mjs articles` or `article ARTICLE_ID`.
- Create seven ideas: `node local-console/cli.mjs week YYYY-MM-DD` (Monday, Korea time).
- Prepare up to five drafts: `node local-console/cli.mjs batch YYYY-MM-DD`. This starts actual Codex jobs; use only when requested.
- Answer a question: `node local-console/cli.mjs answer ARTICLE_ID QUESTION_ID "answer"`. Read the question before answering, never invent the user's experience.
- Set title/angle/owner/date/publishTime/photoDecision: `node local-console/cli.mjs edit ARTICLE_ID '{"owner":"name"}'`.
- Advance explicitly: `node local-console/cli.mjs action ARTICLE_ID draft|review|approve|schedule|unschedule`.
- Generic task questions: `task-answer TASK_ID QUESTION_ID "answer"`, then `continue TASK_ID`.
- `approve` means the user has reviewed and approved the final draft. `schedule` enables public publishing at the planned date/time; perform these only after the user requests approval/scheduling for that draft.
- Display actual progress and last signal, not invented percentages. Structured stage markers are evidence of reported steps, not independent completion verification.
- Plans, drafts, questions and uploads persist locally. Local scheduling requires the Mac and console to be running; overdue more than six hours is marked missed.
- Do not publish an unapproved draft or put any `story/drafts/` content into public deployment. The workflow checks the reviewed draft hash before approval and publishing.

## B01 role prompt pack

For editorial role work in this repository, also read the matching file in `local-console/prompts/`: `01-editor-in-chief.md`, `02-writer.md`, `03-seo-reviewer.md`, or `04-publisher.md`. These are adapted from the AI-OS prompt pack. Use `story/brand.md` for the established audience and weekly plan. Do not treat importing prompts as authorization to launch agents, change schedules, publish, or send messages.

## Publication consent update (2026-09-08)

The user authorizes automatic publication of a reviewed, unchanged article one hour after its Telegram publication-question message is confirmed received by Telegram, unless held or changed. Local `publicationPolicy.enabled` controls this policy. Browser approval alone is not permission to bypass the Telegram notice. Never backdate this timeout to an old review/approval. Missing notification credentials or uncertain delivery must block the timer. Manual publish/hold controls are currently in the local console; do not claim Telegram callback buttons are connected. After a failure, require an explicit retry; do not endlessly redeploy.

## Editorial autonomy update (2026-09-10)

The user authorizes automatic draft revision and SEO review up to publication decision readiness. The console orchestrator may advance those steps, with at most two revision attempts per article revision. Individual agents still must not recursively delegate. Preserve human answers and never invent experience. Editorial readiness is not a human approval. Remote Telegram publish/hold handling is now implemented for an explicitly configured dedicated bot and private chat; actual credentials and delivery must still be verified. Do not enable polling on a bot shared with another integration without resolving the conflict. The one-hour notice policy remains in effect.

## Telegram approval required (2026-09-11)
The latest user request requires actual Telegram approval to publish. Enable `publicationPolicy.requireTelegramApproval`. This supersedes the earlier one-hour no-response auto-publication consent: no response means keep waiting. Browser actions cannot substitute for Telegram approval in this mode. Preserve automated draft revision and SEO review. Never report real Telegram connection verified from mock tests or placeholder environment values.
