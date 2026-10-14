# Fitme ChatGPT marketplace submission

Status: **incomplete preparation draft**, not uploaded, submitted, or published.

The public upload source is `fitme/`. It contains only the portable manifests and
the existing Fitme icon. It deliberately contains no account bindings, secrets,
reviewer credentials, or application source. Version `0.1.0` identifies the initial
plugin package independently of the MCP server version.

## Confirmed listing decisions

- Publisher: Kyrylo Provorov (user-selected; portal verification pending).
- Name: Fitme. Subtitle: Plan and track your workouts.
- The ChatGPT plugin has no paid features or purchases.
- Availability: every available country except Russia. The manifest currently
  lists 248 ISO country/territory codes excluding `RU`; reconcile this list with
  the portal's supported country choices before upload. Do not replace it with
  an empty list, which would remove the restriction.
- Reuse the existing 1024 × 1024 PNG icon for light and dark backgrounds.

## Verified on 2026-10-13

- Production `/health` returned 200 with `{"ok":true}`.
- OAuth resource discovery returned 200 and identified
  `https://clerk.fitmeproject.com` as the authorization server.
- An unauthenticated request to `/` returned 401 with the OAuth resource metadata
  challenge. Authenticated production tool calls have not been verified here.
- Website, support, privacy policy, and terms are public and identify Fitme.
  Their existence is verified; plugin-specific content coverage is incomplete.
- All 72 MCP unit tests passed, MCP TypeScript checking passed, and changed
  source/manifests passed Ultracite. Unit tests do not replace host review cases.
- The local change explicitly adds `destructiveHint: false` to read-only tools
  and marks `log_set` as destructive because re-logging replaces stored values.
  It checks that all 20 registered tools expose the three review annotations.
  This change has not been deployed.

## Preparation still needed

1. Local website drafts now describe the ChatGPT connection, extend the
   mobile-only terms to cover it, and add verified privacy disclosures. Finish
   review and publication of those pages; the public URLs still serve the old
   content. Confirm
   actual request logging, analytics, retention, data sharing, and deletion
   behavior before drafting commitments. The current policy principally lists
   usage data and does not explain profile/workout data returned to ChatGPT.
   See [data-practice evidence](data-practices.md): the MCP access logger records
   request metadata, while mobile Segment events include account information and
   workout measurements. The enabled Mobile App → EU Mixpanel destination and
   its broad Track-property mapping were verified in Segment. Filters, analytics
   retention/deletion, and hosting log retention/drains still need verification;
   Segment redirected to sign-in before those checks finished.
2. Select the appropriate category from the target portal's supported choices.
   Verify the selected publisher identity and domain there.
3. The dedicated demo account is connected and populated with synthetic data.
   Verify reviewer sign-in separately from the existing browser session.
   Keep its credentials only in secure reviewer-access fields, never this repo
   or the ZIP. Do not record a real user's private training data.
4. Completed: the actual walkthrough is hosted as an
   [unlisted YouTube video](https://www.youtube.com/watch?v=IJZfwLEahac).
   Signed-out playback was verified on 2026-10-14 and the URL is in
   `review.demo_recording_url`. YouTube copyright checks were still running
   at publication. See the demo-status notes for recording limitations.
5. Reconcile country codes, validate OpenAI-specific metadata in the target
   portal, and rebuild/inspect the ZIP. The portable public schemas do not
   validate OpenAI extension semantics.

## Review cases and demo

See [demo preparation status](demo-status.md) for the latest connection and
rehearsal evidence. The demo fixture uses Barbell Back Squat with synthetic
20 kg values, verified against the live exercise catalog.

All five positive and three negative cases live in
`fitme/plugin.json` under `extensions.com.openai.review.test_cases`.
**All eight prompts have been rehearsed in ChatGPT:** the five supported flows
returned their expected visible outcomes, and the three unsupported requests
returned explicit refusals. The initial missing-profile blocker was resolved
through mobile onboarding. See the status document for ids, evidence, and limits
of these UI checks; final saved-version validation is still pending. The positive cases create, rename, log and finish a
small demo workout, then inspect its history; run them in order on the dedicated
account. Keep the account's profile set to metric and make sure it has the
standard exercise catalog. Use a fresh account or clean up earlier demo plans
to avoid duplicate-name ambiguity. Do not put setup credentials in the package.

Suggested recording (about 3–4 minutes):

1. Show the Fitme development connection in ChatGPT, already signed in to the
   dedicated demo account. Keep all authentication secrets off screen.
2. Ask: “Find squat exercises in Fitme and show me how to do one.” Show real
   returned exercise details.
3. Run the create-plan prompt from the manifest. Show the resulting plan and
   acknowledge that it becomes active.
4. Run the rename and session-tracking prompts. Show the actual recorded first
   set and the finished session; do not imply the second set was performed.
5. Ask for the latest finished workout and its exercise history. Show the
   returned reps, weight and units.
6. Ask to import Apple Watch sleep data and show the unsupported-capability
   explanation without a Fitme tool call.

Computer control can help perform the walkthrough if desired. It does not by
itself record video: use an available recorder or start the Mac screen recorder
before the walkthrough. Play the saved recording back, check legibility and
absence of secrets, then host it at a chosen reviewer-accessible destination.

## Final portal stage

After preparation, upload the ZIP as a draft using the intended publisher,
connect the production MCP server through OAuth, and run the review cases on
that exact saved version. Check imported metadata, countries, reviewer access,
required scans, and current attestations. The authorized developer must complete
legal/policy attestations. Submission for review and publication after approval
are separate actions; creating a private plugin does neither.

## Rebuild the archive

From the repository root:

```sh
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path('integrations/chatgpt')
with ZipFile('/tmp/fitme-plugin-draft.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted((root / 'fitme').rglob('*')):
        if path.is_file():
            assert not path.is_symlink(), path
            archive.write(path, path.relative_to(root))
PY
unzip -l /tmp/fitme-plugin-draft.zip
```

Do not call this draft submission-ready until the remaining preparation and
saved-version checks are complete.
