# FIT-464 native verification

Captured from the actual History Screen on the `464` simulator: iPhone 18 Pro, iOS 27.2, 402 × 874 logical points. The development build runs this checkout's JavaScript. Temporary query-cache fixtures and navigation/auth setup provide reproducible states; native tabs stay mounted while the fixture redirects to History, these are removed before committing.

The fixture supplies the service's streak result independently of the eight chart columns. Database-backed integration tests verify the calculation; screenshots verify native presentation. The populated fixture has eleven successful preceding weeks and an unfinished current week.

The native pass covered English/metric and Ukrainian/imperial content, singular and plural streak wording, largest Dynamic Type, a zero streak, no active Plan, empty History, error/retry and loading. Captures are retained locally outside the repository.

Native accessibility exposes the badge as one label: `Weekly streak: 1 week`, `Weekly streak: 11 weeks`, or `Серія тренувань: 11 тижнів`. The decorative flame is excluded. Zero and no-Plan states expose no streak label. The badge wraps within the screen gutters at the largest text size, and the content remains scrollable. Text size is reset to Large after verification.

A fresh reviewer found no actionable badge clipping, overlap or readability defects in the English, Ukrainian, zero and largest-text captures. The small flame next to accessibility-size text was a visual nitpick; the streak wording remains readable.

A second review identified incomplete native-chrome captures in some async/empty states. Full-device captures replaced the error and empty evidence. The loading image proves the spinner and absence of a badge, but its native chrome still needs a settled recapture.

This pass covers the supplied iPhone 18 Pro. The smallest/largest supported iPhone passes and an audible VoiceOver traversal remain outstanding. Accessibility snapshots verify labels and grouping, but do not establish speech behavior. The dedicated SE and Pro Max simulators created for the remaining pass are not yet exposed by T3's device inventory.
