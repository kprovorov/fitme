---
status: accepted
date: 2026-10-21
---

# One CSS token source, Figma follows code, dark only

Every design token lives in one Tailwind v4 `@theme` CSS file in `@fitme/design-tokens`, and mobile, web and site `@import` it. Its values are taken from mobile as it ships. Figma's variables are a copy of that file, updated by hand through the Figma MCP in the same PR that changes a token; there is no sync script. Every surface is dark only.

## Context

- **The tokens lived in four places that disagreed.**
  - Mobile's CSS had the colors that actually ship.
  - Web used shadcn zinc and followed the OS light/dark setting.
  - Site had its own dark palette and radius system.
  - Figma had two overlapping variable collections with values the code didn't have.
- **One person designs and builds Fitme, and tokens change a few times a year.**
- **Figma's Variables REST API is Enterprise-only, and the team is on Pro.** Variables can only be written through the Plugin API, which in practice means the Figma MCP or a plugin.

## Decision

- **Code is the source of truth.** The token CSS is the only place a value is defined. Figma follows code, never the other way round.
- **The source is CSS, not JSON.** It's the format all three apps already consume (uniwind follows package `@import`s through Tailwind's compiler), so there's no build step and no generated file to keep fresh.
- **Colors are hex, with 8-digit hex where there's alpha.** That's what Figma shows, so code and Figma compare as plain strings.
- **No Palette tier.** Tokens hold raw values (`primary: #c0ff38`), not aliases to named palette colors. With one brand and one mode, a second layer of names adds nothing.
- **Dark only on mobile, web and site.** No light values exist anywhere.
- **Figma is updated by hand.** The variables were created once through the Figma MCP. A PR that changes the token CSS also updates the matching Figma variable through the MCP (`docs/agents/ui.md`).
- **Type follows Apple's HIG text styles** on every surface: Regular and Emphasized weights per the HIG table.

## Considered options

- **CSS in a shared package, Figma by hand (chosen).** One file, no generator, and it fits how rarely tokens change.
- **`tokens.json` (W3C design tokens) with generated CSS per app.** It's a better input for tooling, but it adds a generator and a staleness check in CI to protect a file that changes a few times a year.
- **Mobile's own `global.css` as the source, parsed for web, site and Figma.** No new package, but web and site would depend on a file inside the mobile app, and parsing an app stylesheet is fragile.
- **A Plugin API sync script, or Tokens Studio, kept in the repo.** It automates something done rarely, and still can't run in CI without Figma credentials.
- **Figma as the source.** That fits a team with designers. Here the code is what ships.
- **Keeping light mode on web and site.** That's a second palette nobody designs or checks.

## Consequences

- **Figma can drift if a token PR skips the Figma step.** The rule in `docs/agents/ui.md` and PR review are the only guard. A read-only MCP query that lists Figma's variables against the CSS catches it.
- **The token CSS can't be generated from Figma, or Figma from it,** without bringing back a sync tool. If changes become frequent, revisit the sync script.
- **Adding light mode later means adding a second `@variant` (and a second Figma mode) everywhere,** probably together with a Palette tier, so modes can share named colors.
- **Each app keeps its own font loading** (native font files on mobile, `next/font` on web and site). The package only fixes the font role names.
