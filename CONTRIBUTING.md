# Contributing

Fitme's source is public to read, but the project doesn't take outside
contributions: pull requests and GitHub issues from outside the team are closed
unread. Work is planned and tracked privately.

Found a security problem? Don't open an issue: follow [`SECURITY.md`](SECURITY.md).

## Running the repo locally

See the [README](README.md#running-it-locally) for setup and the checks, and
[`AGENTS.md`](AGENTS.md) for every command, environment variable and how the
apps fit together.

## Agent skills

`.agents/skills/` holds agent skills from their authors' repositories (linked to
Claude Code through `.claude/skills/`), pinned in `skills-lock.json`. Each is
redistributed under its own licence:

| Skills | Source | Licence |
| --- | --- | --- |
| `ai-sdk` | [vercel/ai](https://github.com/vercel/ai) | Apache-2.0 |
| `eve` | [vercel/eve](https://github.com/vercel/eve) | Apache-2.0 |
| `vercel-react-native-skills`, `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | MIT |
| `animate`, `animate-expo`, `animation-performance`, `animation-vocabulary`, `apple-design`, `ask-sonner`, `break-ui`, `emil-design-eng`, `find-animation-opportunities`, `improve-animations`, `mobile-native`, `pick-ui-library`, `prototype`, `review-animations`, `write-swift` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |
| `building-native-ui`, `upgrading-expo` (an earlier copy of what is now `expo-upgrade`, not in `skills-lock.json`) | [expo/skills](https://github.com/expo/skills) | MIT |
| `clerk` and every `clerk-*` skill | [clerk/skills](https://github.com/clerk/skills) | MIT |
| `revenuecat` | [revenuecat/revenuecat-skill](https://github.com/revenuecat/revenuecat-skill) | MIT |
| `supabase-server` | [supabase/server](https://github.com/supabase/server) | MIT |
| `ultracite` | [haydenbleasel/ultracite](https://github.com/haydenbleasel/ultracite) | MIT |
| `uniwind` | [uni-stack/uniwind](https://github.com/uni-stack/uniwind) | MIT |

A skill whose licence doesn't allow redistribution stays out of the repo:
git-ignore it and install it from `skills-lock.json` with
`npx skills experimental_install`.
