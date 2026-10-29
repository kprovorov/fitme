# Localizing the mobile app

> **Outcome (2026-10-29):** the recommended stack was adopted, and some details changed:
>
> - **Languages:** English and Ukrainian only. Every other device language, Russian
>   included, falls back to English.
> - **The App language comes only from the OS:** the per-app setting, through
>   `supportedLocales: [en, uk]`. There's no in-app picker, and it's **not stored** on the
>   Profile or anywhere else.
> - **Packages:** the supported-language list and its resolver go in `@fitme/core`. The
>   catalogs and the i18next setup go in a new `@fitme/i18n` package, used only by mobile
>   for now (web and site stay English).
> - **Translations:** written by AI in the same PR as the English string. CI fails on
>   mismatched keys, and a human reviews the Ukrainian.
> - **Ukrainian Library content is in scope.** `fitme-exercises` already has `uk/` for every
>   Exercise. Here, the bundle schema accepts `uk` and the Library API gets
>   `?language=en|uk`. A missing translation serves the whole Exercise in English. Search
>   matches both names and sorts by the requested language. Arnold passes the App
>   language, while MCP and the Public API stay English.
> - **Arnold** gets the App language with each message and replies in the language the
>   User writes in.
> - **Out of scope:** the app name, permission prompts, store listings, the RevenueCat
>   paywall, Clerk errors and emails, right-to-left layout (`supportsRTL` left as is) and
>   web/site.

Research note, 2026-10-28. Question: how should `apps/mobile` (Expo SDK 58, expo-router 58,
React Native 0.88, React 19, Hermes, uniwind, react-query, Clerk, RevenueCat, Jest) add
localization: UI strings, plurals, number, date and unit formatting, locale detection,
per-app language on iOS and Android, store metadata, and what RTL would mean?

Repo facts are cited as `path:line`. External claims link to the primary source (official
docs, the project's own repository or npm metadata). Anything I couldn't check is marked
**(unverified)**. Nothing was installed or run on a device.

## TL;DR

- **The app is English-only and has no i18n layer.** `expo-localization` is installed and
  its config plugin is listed with no options (`apps/mobile/app.json:68`). It is only used
  to read the device's measurement system (`apps/mobile/app/settings/edit-profile.tsx:37-41`,
  `apps/mobile/app/onboarding/profile.tsx:29-33`). About 400 user-visible string literals
  sit in `app/`, `components/`, `lib/` and `hooks/` (heuristic, see below), plus 44 English
  labels in `@fitme/core`.
- **Hermes has only three `Intl` services.** The Hermes build RN 0.88 ships has
  `Collator`, `DateTimeFormat` and `NumberFormat`, and no `PluralRules`,
  `RelativeTimeFormat`, `ListFormat` or `Locale`. So every i18n library needs at least an
  `Intl.PluralRules` polyfill on device. Jest runs on Node, which has full ICU, so tests
  won't catch a missing polyfill.
- **Recommended stack: i18next + react-i18next, plus `@formatjs/intl-pluralrules`.**
  - Formatting uses `Intl.DateTimeFormat` / `Intl.NumberFormat` directly.
  - Typed keys come from `as const` resources through `CustomTypeOptions`.
  - `i18next-cli` covers extraction, type generation and a hardcoded-string lint.
  - It is runtime-only: no Babel macro next to the React Compiler, and no ESM-only package
    in Jest. That is why I chose it over Lingui v6. Lingui is the strong runner-up (smaller
    runtime, built-in extraction), but it needs a macro plugin and two polyfills, and it
    ships ESM-only.
- **Language comes from the OS, never an in-app picker.** Declare `supportedLocales` on
  the `expo-localization` plugin. That writes `CFBundleLocalizations` on iOS and a
  `locales_config.xml` on Android 13+. The system per-app language setting does the rest.
  Apple recommends sending users to Settings rather than setting the language in code.
- **`@fitme/core` keeps codes, not copy.** `labels.ts` mixes data codes with display text.
  `getWeightLabel` feeds the Profile's `units.weight` (`packages/services/src/profile.ts:31`),
  and `muscleGroupToName` is the `/v1/muscle-groups` `name` (`apps/api/src/routes/muscle-groups.ts:56,67`).
  The mobile app should translate by enum id, and leave the server's English as it is.
- **Arnold can answer in the User's language with no channel change.** eve hands the
  turn's whole `clientContext` to the model as a user message
  (`apps/arnold/agent/lib/models.ts:35-40`). So `{ model, locale }` reaches the model as it
  is. Add a line to `instructions.md` and an eval. Exercise names stay English until the
  Library bundle has more than `locales.en` (`apps/library/src/bundle.ts:34-35`).
- **RTL is on today by default (SDK 58), with no RTL-ready layout.** The plugin's
  `supportsRTL` defaults to `true`. The app has 11 physical left/right classes against 1
  logical one, and 18 directional SF Symbols. Unless an RTL language is planned, set
  `supportsRTL: false` (an open decision).

## 1. Current state of the repo

### Locale detection

- `expo-localization` 58.0.5 is a dependency (`apps/mobile/package.json:79`). Its plugin
  is in `app.json` with no options (`apps/mobile/app.json:68`), so it takes the defaults:
  `supportsRTL: true`, `forcesRTL: false`, no `supportedLocales`. The installed plugin
  only writes `CFBundleLocalizations` and Android's `localeConfig` when `supportedLocales`
  is non-empty (`node_modules/expo-localization/plugin/build/withExpoLocalization.js:119-133,150-182`).
  So today there is no per-app language entry in system Settings.
- `useLocales()` is used in two places, both only for `measurementSystem`. It is the
  default unit for a User with no Profile yet (`apps/mobile/app/settings/edit-profile.tsx:5,37-41`,
  `apps/mobile/app/onboarding/profile.tsx:5,29-33`). The Profile's `measurement_system` is
  the precedent for a per-User preference with a device default. Both test files mock
  `expo-localization` (`apps/mobile/__tests__/edit-profile-screen.test.tsx:31-32`,
  `apps/mobile/__tests__/onboarding-profile-screen.test.tsx:34-35`).

### How strings are written

- Copy is hardcoded English: JSX text, props (`title`, `label`, `placeholder`,
  `accessibilityLabel`), `Alert.alert` arguments and template literals. Examples:
  - `Alert.alert("Couldn't Activate Plan", failureMessage(error))` (`apps/mobile/app/plans/[planId]/index.tsx:43`),
    with its messages built in `:19-27`.
  - The planner's placeholder (`apps/mobile/app/planner/index.tsx:188`).
- Zod messages are module-scope constants (`apps/mobile/components/forms/profile-form.tsx:95-96`).
  They are evaluated once, at import. Translating them needs a `t` that runs at
  validation time, or keys resolved at render.
- Plurals are hand-rolled English:
  - `plural(count, noun)` adds an `s` (`apps/mobile/components/views/workout-session-history-row.tsx:19-20`).
  - `rep`/`reps` and `set`/`sets` ternaries (`apps/mobile/lib/plan-changes.ts:33,72`).
- Sentences are assembled from parts, which a translator can't reorder. Examples:
  `` `Replace ${a} with ${b}` `` (`apps/mobile/lib/plan-changes.ts:60`), and totals joined
  with `" · "` (`apps/mobile/components/views/workout-session-history-row.tsx:30-38`).
- `@fitme/core` holds the English labels: 27 `case` labels in
  `packages/core/src/labels.ts:9-130`, and 17 more in `muscleGroupToName`
  (`packages/core/src/utils.ts:40`). Some of them are data, not copy:
  - `getWeightLabel` returns `kg`/`lbs`. `@fitme/services` uses it for the Profile's
    `units.weight` (`packages/services/src/profile.ts:1,31`), which the API serves as
    `weight_unit`.
  - `muscleGroupToName` is the `name` that `GET /v1/muscle-groups` serves
    (`apps/api/src/routes/muscle-groups.ts:56,67`).
  - MCP's catalog uses the goal, place and level labels (`apps/mcp/src/tools/catalog.ts:3-5`).
  - `apps/web` imports them too (`apps/web/app/(app)/dashboard/page.tsx:4-6`).
- `formatters.ts` hardcodes English units and formats: `${weight} kg`, `${height} cm`,
  `1h 5min` (`packages/core/src/formatters.ts:5-34`). `formatElapsed` (`:40-49`) is a
  clock, which is fine in any locale.
- Segment event names are English and must never be translated. There are 13:
  - `Exercise Added`, `Exercise Deleted`, `Exercise Replaced`
  - `Plan Activated`, `Plan Deleted`, `Plan Saved`, `Plan Update Suggested`
  - `Profile Filled`, `Set Tracked`
  - `User Deleted Account`, `User Logged In`, `User Logged Out`, `User Registered`

  For example, `segmentClient.track("Plan Saved", …)` (`apps/mobile/hooks/queries/plans.ts:72`).
  They live in `track()` calls, so any "no hardcoded string" lint has to ignore `track`'s
  first argument.

**Size of the job.** I counted over the 132 non-test `.tsx` files in `app/` and
`components/`, using greps that overlap:

| What the grep matched | Count |
| --- | --- |
| Lines with capitalised JSX text | 219 |
| `title=` / `label=` / `placeholder=` / `accessibilityLabel=` / `description=` / `message=` / `text=` string props | 108 |
| `title:` / `label:` / `message:` / `text:` object literals starting with a capital | 53 |
| `Alert.alert` calls (usually two strings each) | 11 |
| Capitalised multi-word literals in `lib/` and `hooks/` | 41 |

After overlap, that's roughly **400 strings in the app**, plus the 44 core labels. This is
a heuristic. It misses lowercase copy and counts a few non-copy strings.

Tests depend on the English copy. There are 372 `*ByText` / `*ByLabelText` /
`*ByPlaceholderText` / `*ByRole` queries, and the Maestro flows have 53 `text:` / `tapOn:`
lines (`apps/mobile/e2e/flows/`). So English under Jest and Maestro is a hard requirement.

### Dates, numbers and weights today

The app formats dates two ways, inconsistently:

- `toLocaleDateString(undefined, …)` follows the device
  (`apps/mobile/app/workout-sessions/[workoutSessionId]/summary.tsx:34`).
- date-fns `format` with no `locale` is always English, with English patterns:
  - `"LLLL yyyy"` (`apps/mobile/app/(tabs)/history/index.tsx:47`)
  - `"EEE, MMM d · h:mm a"`, which is 12-hour whatever the device says
    (`apps/mobile/components/views/workout-session-history-row.tsx:51`)
  - `"d MMMM"` (`apps/mobile/components/views/exercise-history-view.tsx:35`)

  `history/index.tsx:39` (`yyyy-MM`) is a grouping key, not copy.

Numbers use `toLocaleString()` with no locale, followed by the unit as an English suffix
(`apps/mobile/components/workout-sessions/workout-session-stats.tsx:98`,
`apps/mobile/components/views/workout-session-history-row.tsx:34`). The weight unit comes
from the Profile's `measurement_system` through `getWeightLabel`. The Plan Update
formatter spells units for VoiceOver as `kilograms` / `pounds` (`apps/mobile/lib/plan-changes.ts:22-23`).
No code calls `Intl.*` directly.

### Hermes `Intl`

RN 0.88 pins `hermes-compiler` 260318099.0.4 (`node_modules/react-native/package.json:168`),
the Hermes V1 `260318099.0.0-stable` line.

- On that branch, `PlatformIntl.h` defines only `Collator`, `DateTimeFormat` and
  `NumberFormat` ([source](https://github.com/facebook/hermes/blob/260318099.0.0-stable/include/hermes/Platform/Intl/PlatformIntl.h)).
  The repo tree has no `PluralRules`, `RelativeTimeFormat` or `ListFormat` file.
- Hermes's own doc lists the same set as supported on both platforms
  ([IntlAPIs.md](https://github.com/facebook/hermes/blob/static_h/doc/IntlAPIs.md)). It
  also lists the limits:
  - iOS `NumberFormat` doesn't support compact or engineering notation, `compactDisplay`
    or `signDisplay`.
  - `formatToParts` works on Android only.
  - Android 11 has "rough edges" with `style: 'unit'`.
- i18next's docs say the same: "the Hermes engine still does not implement
  Intl.PluralRules" ([i18next plurals](https://www.i18next.com/translation-function/plurals)).
- On iOS, Hermes resolves the default locale once per process from
  `[NSLocale currentLocale]`
  ([PlatformIntlApple.mm](https://github.com/facebook/hermes/blob/260318099.0.0-stable/lib/Platform/Intl/PlatformIntlApple.mm)).
  On iOS that locale likely combines the app's resolved localization with the User's
  region, so in an app that declares only English, a French User gets English month
  names with French conventions **(unverified: Apple behaviour I didn't find documented,
  and not tried on a device)**. Declaring the shipped languages in
  `CFBundleLocalizations` is what lets `Intl` follow the language.
- `lib/Platform/Intl/impl_icu/` exists on that branch, but CMake builds it only on
  platforms that are neither Android nor Apple
  ([CMakeLists.txt](https://github.com/facebook/hermes/blob/260318099.0.0-stable/lib/Platform/Intl/CMakeLists.txt)).
  Phones still use the platform implementations.

### Server text that reaches the UI

- **Public API messages don't reach the UI.** Screens map `ApiError.code` to their own
  copy, for example `failureMessage` (`apps/mobile/app/plans/[planId]/index.tsx:19-27`).
  `/v1/muscle-groups` names are English, but the app uses core's enum directly.
- **Clerk messages do.** `getClerkErrorMessage` shows Clerk's `longMessage` as it is, with
  an English fallback (`apps/mobile/lib/clerk.ts:22-31`). Twenty-one call sites use it.
  Clerk's localization covers prebuilt components only, is "experimental", and the hosted
  Account Portal "will remain in English"
  ([Clerk localization](https://clerk.com/docs/guides/customizing-clerk/localization)).
  This app uses custom flows. So translated auth errors mean mapping Clerk error `code`s
  to keys. Whether Clerk's emails (the verification code) can be localized is
  **(unverified)**.
- **Arnold's chat errors do.** The chat shows the runtime's `error.message` as it is
  (`apps/mobile/components/chat/prompt-input.tsx:43`).
- **Arnold's own text.** Its system prompt is English and says nothing about language
  (`apps/arnold/agent/instructions.md:1`). The mobile app sends only `custom: { model }`
  per turn (`apps/mobile/lib/arnold-chat.ts:19-21`).
- **Library content is English-only, but shaped for locales.**
  - The bundle has `locales: z.strictObject({ en: … })` (`apps/library/src/bundle.ts:34-35`).
    ADR 0007 says "a locale folder (`en` for now)" (`docs/adr/0007-exercise-library-is-a-separate-private-service.md:21`).
  - The served library reads `locales.en` (`apps/library/src/served-library.ts:55`).
  - Search matches lowercased English names only (`apps/library/src/served-library.ts:74`,
    `apps/library/src/routes/exercises.ts:190-193`). A Spanish User typing "sentadilla"
    finds nothing.
- **RevenueCat paywalls are localized in the RevenueCat dashboard**, per locale, with the
  default locale as the fallback
  ([RevenueCat paywall localization](https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/localization)).
  How the SDK picks the locale is **(unverified)**.

### UI rules and the literal check

- The literal check (`packages/design-tokens/src/literal-check.ts`) parses every `.tsx`
  with TypeScript. It deliberately exempts JSX text ("copy like 'Order #1'",
  `docs/agents/ui.md:153`). Its `ALLOWLIST` (`literal-check.ts:53`) shows the pattern for
  justified exceptions.
- A sibling "copy check" could invert that exemption. It would flag `JsxText` with
  letters, and string literals in `title` / `label` / `placeholder` /
  `accessibilityLabel` props, that aren't inside `t()` / `<Trans>`. It would skip
  `track()`, `testID` and the like.
- `i18next-cli lint` already flags "user-facing text in JSX elements and attributes that
  isn't wrapped in `t()`/`<Trans>`"
  ([i18next-cli README](https://github.com/i18next/i18next-cli#lint)). The ESLint plugins
  (`eslint-plugin-i18next`, `eslint-plugin-lingui`) don't run under Biome, which this repo
  uses. Whether Biome has an equivalent rule is **(unverified)**.

### RTL exposure

- On SDK 58, "RTL support is enabled by default". The app renders RTL when the device
  language is RTL. On iOS, the language must also be in `supportedLocales`
  ([Expo localization guide](https://docs.expo.dev/guides/localization/#rtl-support)).
  The plugin sets `android:supportsRtl` from `supportsRTL`
  (`withExpoLocalization.js:113-116`). So an Arabic or Hebrew Android device would likely
  get a mirrored English UI today **(unverified on device; the release pipeline builds iOS only)**.
- The app isn't RTL-ready. It has 11 physical `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`
  classes, 1 logical class, and 18 directional symbols (`arrow.right` ×11,
  `chevron.right` ×7). Nothing reads `I18nManager`.
- React Native's `textAlign` has no `start`/`end`. The default is the physical left, so a
  shared `Text` would need `textAlign: 'left'` set to flip
  ([Expo localization guide](https://docs.expo.dev/guides/localization/#text-alignment)).

## 2. Options

### Platform: `expo-localization` and system settings

Expo's guide says
([Expo localization guide](https://docs.expo.dev/guides/localization/)):

- On recent iOS and Android, the app language can be set per app, "so you usually don't
  need to build a custom UI". Enabling it means passing `supportedLocales` (one array, or
  `ios` / `android`) to the plugin.
- Don't hand-roll dates and numbers: "use standardized `Intl` APIs". `'default'` as the
  locale uses the device's locale.
- `getCalendars()` gives `uses24hourClock`, `timeZone` and `firstWeekday`
  ([API reference](https://docs.expo.dev/versions/latest/sdk/localization/#localizationgetcalendars)).
  `Intl.DateTimeFormat` with no `hourCycle` follows the locale's default, not the device's
  24-hour toggle, so `uses24hourClock` is what sets `hourCycle`. Today
  `workout-session-history-row.tsx:51` hardcodes 12-hour `h:mm a`.
- iOS relaunches the app when the device language changes. Android doesn't, so re-read
  `getLocales()` on `AppState` changes. `useLocales()` re-renders on OS changes
  ([API reference](https://docs.expo.dev/versions/latest/sdk/localization/)).
- Native strings go in `expo.locales`, one JSON file per language: `CFBundleDisplayName`,
  permission usage descriptions, `Localizable.strings`, Android `app_name`. They also
  need `ios.infoPlist.CFBundleAllowMixedLocalizations: true`.
- For a language change without a restart, wrap the navigator in expo-router's
  `LocaleProvider` with the direction.

The plugin options are `supportsRTL` (default `true`), `forcesRTL` (default `false`) and
`supportedLocales`
([API reference](https://docs.expo.dev/versions/latest/sdk/localization/#configurable-properties)).
For iOS, the installed plugin writes `supportedLocales` as `CFBundleLocalizations`
(`withExpoLocalization.js:132-133`). Apple describes that key as "the localizations
handled manually by your app"
([CFBundleLocalizations](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundlelocalizations)),
which is exactly the case for a JS-translated app. For Android, it writes
`res/xml/locales_config.xml`, sets `android:localeConfig`, and limits resource qualifiers
(`withExpoLocalization.js:159-193`).

**iOS per-app language** came with iOS 13. "When the user does change the language of your
app, your app will be relaunched in the target language." Apple says "do not attempt to
set the application language manually in code". For an in-app option, "we recommend you
Launch into Settings"
([WWDC19 session 403](https://developer.apple.com/videos/play/wwdc2019/403/)). The
Settings entry appears only once the User has more than one preferred language
**(unverified; reported on the Apple forums, not documented)**.

**Android per-app language** came with Android 13 (API 33). It needs a `LocaleConfig`, and
leaving out `android:localeConfig` means users can't set the app's language. On Android 12
and lower it goes through AppCompat 1.6+'s `AppCompatDelegate.setApplicationLocales`.
Setting a locale recreates the Activity unless the app handles the config change
([Android app languages](https://developer.android.com/guide/topics/resources/app-languages)).

### Translation libraries

Versions and dates come from the npm registry (2026-10-28). Unpacked size is the whole
published package (every build format, types and maps), not what ends up in the bundle.
The real cost needs measuring in a spike (`npx expo export` plus a source-map explorer)
**(unverified)**.

| | i18next + react-i18next | Lingui | react-intl (FormatJS) | i18n-js |
| --- | --- | --- | --- | --- |
| Latest | i18next 26.5.11 (2026-10-25), react-i18next 17.1.9 (2026-10-25) | 6.10.1 (2026-10-22) | 12.1.6 (2026-10-27) | 4.5.4 (2026-10-06) |
| Unpacked | 544 kB + 982 kB. i18next has no dependencies; react-i18next pulls `@babel/runtime`, `html-parse-stringify`, `use-sync-external-store` | `@lingui/core` 41 kB + `@lingui/react` 25 kB | 200 kB + `intl-messageformat` 118 kB | not checked |
| Hermes polyfills | `Intl.PluralRules` ([docs](https://www.i18next.com/translation-function/plurals)) | `Intl.PluralRules` and `Intl.Locale` ([RN tutorial](https://lingui.dev/tutorials/react-native)) | `Intl.PluralRules` and `Intl.RelativeTimeFormat`, plus `DisplayNames` if used ([docs](https://formatjs.github.io/docs/react-intl/)) | not checked |
| Plurals and ICU | CLDR suffixes (`key_one`, `key_other`, JSON v4). ICU via the `i18next-icu` plugin | ICU messages, compiled | ICU for every string | own syntax |
| Key typing | `CustomTypeOptions.resources` from `as const` `.ts` resources, or generated by `i18next-cli types`. Selector API `t($ => $.a.b)` opt-in ([TS docs](https://www.i18next.com/overview/typescript)) | Source text as message with generated IDs, or explicit IDs | `id` is `string` unless you override a global union ([docs](https://formatjs.github.io/docs/react-intl/)) | none |
| Extraction | `i18next-cli` 1.80.5 (2026-10-26): `extract`, `types`, `status`, `lint` ([README](https://github.com/i18next/i18next-cli)) | built-in `lingui extract` | `@formatjs/cli` **(unverified)** | none |
| Build step | none, runtime only | `@lingui/babel-plugin-lingui-macro`, first in Babel `plugins`. `babel-plugin-macros` is deprecated ([installation](https://lingui.dev/installation)). Optional `@lingui/metro-transformer` for `.po` | none | none |
| Jest | plain CJS/ESM runtime. Init synchronously with bundled resources | v6 is ESM-only, minimum Node 22.19 or 24 for `require(esm)`. The migration guide doesn't mention Jest ([migration](https://lingui.dev/releases/migration-6)) | plain runtime | plain runtime |
| Activity | repo pushed 2026-10-28 | repo pushed 2026-10-28 | repo pushed 2026-10-28 | release 2026-10-06 |

Expo's guide uses i18n-js as its example and lists Lingui, fbtee, react-i18next and
Intlayer as alternatives ([guide](https://docs.expo.dev/guides/localization/#other-translation-libraries)).

**Polyfill.** Use `@formatjs/intl-pluralrules` 6.3.16. On React Native, import
`polyfill-force.js` (the detection code "can slow down your app's startup time by
seconds"), then one `locale-data/<lang>.js` per shipped language
([polyfill docs](https://formatjs.github.io/docs/polyfills/intl-pluralrules/)). Its 953 kB
unpacked size covers every locale's data. Only the imported locales get bundled.

**Fit with this repo:**

- *i18next.* Nothing changes in the build:
  - Babel stays `babel-preset-expo` plus the React Compiler override (`apps/mobile/babel.config.js`).
  - Jest's `transformIgnorePatterns` stays as it is (`apps/mobile/package.json:31`).
  - Tests init it synchronously in `test-utils/setup.ts`, which already swaps modules.
  - One polyfill.
  - `i18next-cli lint` covers the hardcoded-string check without ESLint.

  The costs are a bigger runtime, and keys you write and keep yourself.
- *Lingui.* The best authoring experience: `<Trans>` with real text, extraction from
  source, hashed IDs, a tiny runtime. The friction:
  - A macro plugin has to run before the React Compiler in Metro and in Jest.
  - The packages are ESM-only and pass through jest-expo's transform.
  - It needs two polyfills and a `.po` toolchain.

  Each of these is **(unverified)** until a spike.
- *react-intl.* Needs the most polyfills on Hermes, and ICU syntax everywhere. It brings
  nothing here that i18next with `i18next-icu` doesn't.

### Translation workflow (brief)

- **JSON in the repo, edited by hand or by an agent.** Keep the files next to the code.
  `i18next-cli extract --ci` fails CI when they're stale
  ([README](https://github.com/i18next/i18next-cli#extract)). This needs no new vendor,
  and it suits a handful of languages.
- **A TMS syncing through Git.** Crowdin's GitHub integration syncs hourly by default and
  opens translation PRs from an `l10n` service branch
  ([Crowdin](https://support.crowdin.com/github-integration/)). Other options:
  - Tolgee: an open-source platform ([repo](https://github.com/tolgee/tolgee-platform)).
  - Locize: from the i18next team. `i18next-cli` ships `locize-sync`
    ([README](https://github.com/i18next/i18next-cli)).
- **LLM translation in CI.** The repo already pays for AI Gateway (ADR 0006). A script
  could translate new keys and open a PR for human review. No vendor docs apply, and the
  quality is **(unverified)**.

### Store metadata (brief)

- **App Store Connect.** Languages there "are part of your app's metadata", separate from
  the binary's localizations. Name and privacy URL are app-level. Description, keywords
  and screenshots belong to the platform version
  ([App Store Connect](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information)).
  The app's display name is localized in the binary, through `expo.locales`
  ([Expo guide](https://docs.expo.dev/guides/localization/#translating-app-metadata)).
  Today it is "Fitme Project" (`apps/mobile/app.json:3`), and the app has no usage
  descriptions.
- **Play Console.** You can localize the title, the short and full descriptions, and the
  graphics. Free machine translation is offered for 10 languages
  ([Play Console help](https://support.google.com/googleplay/android-developer/answer/9844778)).

## 3. Recommendation

### Stack

- `i18next` + `react-i18next`, with `@formatjs/intl-pluralrules/polyfill-force.js` and
  each shipped language's locale data, imported first in `apps/mobile/polyfills.js`.
- `Intl.DateTimeFormat` / `Intl.NumberFormat` for every date and number, wrapped in small
  helpers in `apps/mobile/lib/format.ts`. Times take `hourCycle` from
  `getCalendars()[0].uses24hourClock`. date-fns goes away for display (keep it for date
  math if it's still useful).
- Test `Intl.NumberFormat` with `style: 'unit'` (kilogram, pound) on an iOS and an Android
  device before relying on it **(unverified)**. Otherwise format the number and translate
  the unit as a key.
- Keys typed through `CustomTypeOptions` (or `i18next-cli types`). `i18next-cli` handles
  `extract --ci` and `lint` in the `checks` job, next to `pnpm literal-check`.
- Language from the OS: `getLocales()` at startup, re-read on `AppState` foreground for
  Android, and `supportedLocales` on the plugin. No in-app picker. A Settings row can open
  the system page instead (`Linking.openSettings()`).
- `measurement_system` stays separate from the language. A British User reading Spanish
  still picks their units.

### Where things live

- **`@fitme/core` exports codes only.** Mobile translates enum ids (`goal.fat-loss`,
  `muscleGroup.chest`, `gender.male`). `getWeightLabel`'s `kg`/`lbs` stays a data code.
- **Core's English labels stay for the servers.** The API, MCP and web keep calling
  `muscleGroupToName` and the label functions, so nothing in `/v1` changes. A translated
  `name` would be additive later, through `Accept-Language`.
- **Core can't import i18next.** Each tsdown app would need it in its `dependencies`
  (AGENTS.md, "Workspace packages are source-only").
- **Copy lives in `apps/mobile/i18n/` or in a new shared package.** The resources would be
  `en.ts` as `as const`, plus a JSON or `.ts` file per language. A shared package lets
  web and site share it later.
- **Core formatters that build English take a formatter argument, or move to mobile.**
  This covers `formatWeight`, `formatHeight` and `formatWorkoutDuration`
  (`packages/core/src/formatters.ts:5-34`).

### Tests

- `test-utils/setup.ts` inits i18next synchronously with `lng: "en"` and the English
  resources, and mocks `expo-localization` to `en-US`. Tests never read the device
  locale, so the 372 text queries and the Maestro flows stay English and unchanged.
- Node's full ICU hides a missing polyfill. Add a unit test that imports `polyfills.js`
  and checks `Intl.PluralRules` exists.
- A plural test per shipped language is cheap with `i18n.changeLanguage`.
- Pin `TZ` for any date test. Nothing sets it today (no `TZ` in `apps/mobile/package.json`
  or `test-utils/`).

### Arnold

- Send `clientContext: { model, locale }` from `arnoldRunConfig`
  (`apps/mobile/lib/arnold-chat.ts:19`). The resolver reads only `model`, and the model
  sees the whole object (`apps/arnold/agent/lib/models.ts:35-40`), so the Arnold side
  needs no channel or resolver change.
- Add one line to `agent/instructions.md`: reply in the language of the User's messages,
  using `locale` as a hint. Always call `search_exercises` with English terms, since the
  Library indexes English names.
- Add an eval in `apps/arnold/evals/` for a non-English request.
- Exercise names in the plan card come from the Library, so they stay English until
  Library content is localized.

### Phased rollout

Phases 0 and 1 ship no language; phase 2 is the first that changes what Users see.

1. **Phase 0, groundwork.**
   - Move every date and number to the `Intl` helpers.
   - Replace the hand-rolled plurals.
   - Split core codes from copy.
   - Pin `en` in Jest.
   - Decide on `supportsRTL`.
2. **Phase 1, the layer, still English only.**
   - Add i18next, the polyfill, typed `en` resources and the `i18next-cli` checks.
   - Move strings over screen by screen. Each PR keeps the English copy byte-identical,
     so tests don't change.
   - Map Clerk error codes to keys.
   - Leave Segment names alone.
3. **Phase 2, the first language.**
   - Add its resources and `supportedLocales`.
   - Add `expo.locales` (app name) with `CFBundleAllowMixedLocalizations`.
   - Localize the App Store metadata and the RevenueCat paywall.
   - Send Arnold its locale, and add the prompt line and the eval.
   - Run the screenshot loop in that language (`docs/agents/ui.md`) for text overflow.
4. **Phase 3, server content.**
   - Localize Library content: more `locales` in the `fitme-exercises` bundle, and
     `served-library.ts` per locale.
   - The API takes a locale parameter, and `ETag` and the mobile MMKV keys
     (`library.exercise-summary.<slug>`) include the locale.
   - Search indexes localized names.
   - Translated `/v1/muscle-groups` names, if any client needs them.

   This is its own project.
5. **Phase 4, RTL.** Only if an RTL language is chosen: logical classes, mirrored icons,
   and `textAlign` on the shared `Text`.

## Open decisions

1. **Which languages, and how many at first?** This drives everything else, RTL included.
2. **Library: i18next (recommended) or Lingui?** Worth a one-day spike on Lingui's macro
   with the React Compiler and Jest, if authoring with real text matters more than zero
   build changes.
3. **Where translations live:** `apps/mobile/i18n/`, or a new `packages/i18n` shared with
   web and site later.
4. **`supportsRTL`:** set `false` now (no mirrored English UI on RTL Android devices), or
   leave it `true` and make the layout logical as you go.
5. **Store a `locale` on the Profile?** It would let Arnold and any future server copy
   (emails, push) know the language without per-turn context. It costs a migration,
   additive `PUT`/`PATCH /v1/profile` fields, and a sync rule for when the device
   language changes. Per-turn context alone covers Arnold.
6. **Translation workflow:** hand or agent edits in the repo, a TMS (Crowdin, Tolgee,
   Locize), or LLM drafts in CI with human review.
7. **Library content localization:** in scope, or is "UI translated, Exercise names
   English" acceptable for launch? It also changes ADR 0007's "`en` for now".
8. **Clerk:** are translated custom-flow errors (code mapping) enough, and do the Clerk
   emails need localizing (**unverified** whether Clerk supports it)?
