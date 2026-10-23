# Demo preparation status

2026-10-14: the user created and verified `demo@fitmeproject.com` in the
Fitme account portal. The account was connected through OAuth to the existing
ChatGPT **Fitme Project** development app and labeled
**Fitme Demo — demo@fitmeproject.com**.

Credentials are intentionally absent from this repository, the plugin ZIP, and
the demo script. Store reviewer access only in secure submission-portal fields
when ready.

The personal connection remains installed and primary. No personal training data
was changed, and it must not be used in the reviewer recording. Adding the demo
connection does not prove that tools use it: the demo rehearsal explicitly supplies the new connection id on tool calls.
The OAuth screen verified the demo email before that connection was created.

A ChatGPT connectivity rehearsal returned `ping` OK and server version `0.2.0`.
Ping itself contains no account identity; do not use it alone as identity proof.
The host assistant reports passing the exact demo `link_id`. The subsequent
profile check returned missing onboarding, consistent with this fresh account.
Rehearsal chat: https://chatgpt.com/c/6acf6101-19b4-83ed-afa6-ccc741095734

## Read-only backend rehearsal

These are direct tool checks, not recorded ChatGPT prompt tests or final portal
validation of the submitted package:

- **Passed:** `ping` reports healthy server version `0.2.0`.
- **Passed:** `list_exercises` with `search="squat"` returns four library entries
  with `hasMore=false`.
- **Passed:** `get_exercise` using the returned Barbell Back Squat id provides
  its matching details and nonempty instructions.
- **Passed:** `list_plan_options` provides `beginner`, `gym`, and
  `general-health-fitness` as valid options.
- **Fixture correction:** the catalog search did not return a bodyweight squat.
  A `push-up` search was also empty. The create-plan/session cases now explicitly
  use the verified Barbell Back Squat library entry and synthetic 20 kg values.
  The dedicated account must use metric units before running these cases.

## ChatGPT rehearsal results (2026-10-14)

- **Passed, visible catalog outcome:** exercise-discovery prompt returned the
  four squat exercises, the verified Barbell Back Squat id, instructions and
  the actual Fitme exercise video link. The host reports `list_exercises` and
  `get_exercise` with the explicit demo connection. It also inserted an unrelated
  illustrative web image; omit this distraction from the final recorded demo.
- **Passed on retry, visible create result:** the first attempt correctly stopped
  because onboarding was incomplete. After the user completed onboarding, the
  host confirmed metric units and created/activated `Marketplace Demo`, two
  10-rep sets at 20 kg with 60 seconds rest. One-time write approval was used.
  Plan id: `9722647b-499b-4007-90db-7f12e6ee7844`.
  Workout id: `d0e4ee70-249b-4ffd-89df-f8607a18092e`.
  Chat: https://chatgpt.com/c/6acf61ab-562c-83ed-a268-560325373ba6
- **Passed, visible rename result:** renamed to `Marketplace Demo Revised`;
  the returned plan and workout ids remain the same, with two 10-rep / 20 kg
  sets and 60 seconds rest. The host reports a metadata-only name change.
- **Passed, visible session result:** started the plan workout, logged only
  the first set (10 reps / 20 kg), and finished session
  `b5a4a74f-510f-4a9d-90ed-f16fdc751dd0`. Set two remains unlogged.
- **Passed, visible history read-back:** the latest finished workout and exercise
  history returned that same session, one logged set at 10 reps / 20 kg, and
  metric units. The UI reported only one recorded session for this exercise.
- **Passed, visible refusal outcomes:** nutrition logging, Apple Watch sleep /
  heart-rate import, and gym-class booking each returned an explicit unsupported
  explanation and did not claim a saved meal, import, or reservation. No Fitme
  write activity is shown. Raw transport-level absence of tool calls is not
  independently audited by these UI checks.


These rehearsals use the existing development installation, not the final saved
submission version. Tool arguments are reported by the host; the UI does not
expose a full raw transport log.
The fresh walkthrough was recorded, saved, and hosted. Local playback, sampled
visual review, and signed-out hosted playback are verified below.

## Recording dependency

The available Record & Replay skill documents an event stream and workflow-skill
capture; its documentation does not establish an exported video recording.
Do not treat captured events or screenshots as the required demo video. Use a
video recorder for the real ChatGPT walkthrough, then play back the saved video
and verify its hosted reviewer-accessible URL before adding it to the manifest.

## Next steps

The recording is hosted and signed-out playback is verified below. Finish
policy deployment and final submission-version checks. Use unique plan names for any second recording run;
this account already contains `Marketplace Demo Revised`. Do not silently create
another plan with the same name and then rely on name-only selection.

The live review installation still uses production MCP version `0.2.0`.
The local annotation fixes and website policy/content changes are not deployed;
revalidate the final deployed version and the portal-saved submission before
calling the package submission-ready.

## Recording walkthrough (2026-10-14)

User reported the recorder running before the walkthrough.
Chat: https://chatgpt.com/c/6acf6b8d-e31c-83ed-b1b6-761bc0a10fbc
Fresh plan name: `Fitme Video Demo` (separate from rehearsal fixture).
Catalog results and instructions were shown; the host rendered an unavailable
image thumbnail alongside the actual Fitme video link. This rendering issue
should be assessed when reviewing the saved recording.

During the recording walkthrough, `Fitme Video Demo` was created and activated,
then renamed to `Fitme Video Demo Revised`. Returned plan id:
`4a25236b-5e1e-438d-a0c6-92a6f739a775`. The workout was started, its first
set logged at 10 reps / 20 kg, and the session finished with set two unlogged.
Returned session id: `645eddd8-92c0-4f63-a61e-a3ad6e662797`. One-time
rename and finish approvals were handled during the visible walkthrough.

The recording walkthrough's history lookup returned the new finished session
(10 reps / 20 kg, second set unlogged) and both synthetic squat-history entries.
The Apple Watch import request returned an explicit unsupported explanation,
with no claimed import. The user stopped and saved the recording.

## Saved recording review (2026-10-14)

- Source: `~/Desktop/Screen Recording 2026-10-14 at 13.46.29.mov`.
- Duration: 319.705 seconds (5:20); 1664 × 1614; 43,719,782 bytes.
- One video track, no audio track. Original file remains unchanged.
- QuickTime opened the movie and playback visibly progressed. AVFoundation
  decoded review frames every 10 seconds throughout the recording successfully.
- Reviewed frames cover catalog/instructions, creation, rename, session logging
  and finish, history read-back, and the unsupported Apple Watch import. Text
  and outcomes are readable. The first catalog prompt is partially above the
  viewport at recording start, but its intent and resulting catalog are visible.
- No passwords or access tokens were visible in the sampled footage. Demo
  email, connection identifier, synthetic record ids, and the ChatGPT avatar
  are visible. This is sampled inspection, not an exhaustive frame-by-frame audit.
- An unavailable exercise thumbnail is visible; instructions and the actual
  video link are present. The exercise video itself was not played. A brief
  macOS folder-access prompt overlaps the left edge near 2:20.
- The final unsupported-import result remains visible for roughly a minute.
- Hosted on YouTube as unlisted, at the user's request and after explicit
  confirmation of YouTube's upload agreement. Title: Fitme for ChatGPT — Review Demo.
- URL: https://www.youtube.com/watch?v=IJZfwLEahac
- YouTube confirmed publication; the watch page visibly shows Unlisted.
- Signed-out Chrome Incognito playback progressed to 0:17 / 5:19 with the
  Sign in link visible. No reviewer login or private invitation was needed.
- The source is unchanged. The hosted duration is rounded to 5:19.
- YouTube copyright checks were still running at publication, not yet cleared.
- The verified URL is stored in review.demo_recording_url. This remains a
  preparation draft because policy deployment and final portal checks are pending.
