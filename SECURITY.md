# Security policy

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting: the
**Report a vulnerability** button under this repository's
[Security tab](https://github.com/kprovorov/fitme/security/advisories/new).

Never open a public issue, pull request or discussion about a vulnerability,
and don't share it anywhere public before it's fixed.

Include what you found, where, how to reproduce it and what an attacker could do
with it. Only test against your own account and data: don't access other
people's data, degrade the services or run automated scans that generate heavy
traffic.

## Scope

- The deployed apps built from this repository:
  - the REST API (`apps/api`, api.fitmeproject.com)
  - the Coach (`apps/coach`)
  - the Exercise Library API (`apps/exercises`, exercises.fitmeproject.com)
  - the MCP server (`apps/mcp`, mcp.fitmeproject.com)
  - the webhooks app (`apps/webhooks`)
  - the web app (`apps/web`)
  - the marketing site (`apps/site`)
  - the Fitme mobile app (`apps/mobile`)
- The code in this repository, including its GitHub Actions workflows.

Out of scope: vulnerabilities in third-party services we use (Clerk, Supabase,
Vercel, RevenueCat, Sentry and others); report those to the vendor.
