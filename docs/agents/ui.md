# UI

How agents build and check UI in Fitme. The mobile app is the product, and the bar is a native iOS app, not a web page in a phone frame. Most of this file is about `apps/mobile`; web and site are at the end.

Where a skill says otherwise, this file wins for this repo: [When a skill disagrees](#when-a-skill-disagrees) lists the known cases.

## Terms

- **Screen**: a route file under `apps/mobile/app/`. It owns the native header (`Stack.Screen` options), the data hooks, and the choice between loading, empty, error and content. _Avoid_: page, route component.
- **View**: a component a Screen renders with data passed as props, under `components/views/` or a feature folder (`components/plans/`, `components/chat/`). _Avoid_: container, widget.
- **Primitive**: a component in `components/ui/`. Screens and Views are built from Primitives, never from bare `react-native` controls when a Primitive exists. _Avoid_: atom, base component.
- **Token**: a semantic design value (color, type size, spacing, radius, size, font role), or a text style built on them, defined once in `@fitme/design-tokens` (`packages/design-tokens/src/tokens.css`) and imported by every app. _Avoid_: magic number, hard-coded value.

## See it before you ship it

Code that compiles isn't done. Every UI change is looked at, by you and then by someone who didn't write it:

1. Run the app on an iOS simulator (`pnpm ios`) and go to the changed Screen. Expo Go can't run this app (it has custom native modules), so it's always the dev build. If Xcode 27 refuses to target the simulator (it asks for a signing certificate), let it prebuild, then build with `xcodebuild -workspace FitmeProject.xcworkspace -scheme FitmeProject -configuration Debug -destination id=<UDID>`, install with `xcrun simctl install`, and open `exp+fitme-project://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` with `expo start --dev-client` running. The Maestro flows and subflows in `apps/mobile/e2e/` (sign-in, register) get you past auth.
   - A temporary sign-in helper (a dev-only screen or effect that signs a test User in for the loop) never holds the test User's email or password as a string literal. It reads them from the gitignored `apps/mobile/.env` (`EXPO_PUBLIC_DEV_SIGN_IN_EMAIL` / `EXPO_PUBLIC_DEV_SIGN_IN_PASSWORD`; Expo only inlines `EXPO_PUBLIC_` variables), and only under `__DEV__`. Delete it before the turn ends, and check `git status` shows nothing of it before any commit: a commit made later (T3 Code's commit button included) takes whatever is left in the worktree. The pre-commit secret scan (`gitleaks`, see AGENTS.md **Git**) fails a commit with a password literal, but only on a machine that has gitleaks.
2. Screenshot it (`xcrun simctl io booted screenshot /tmp/<name>.png`) and read the image. Fix what looks off, then take it again.
3. Check every state the Screen has (see [Every Screen has four states](#every-screen-has-four-states)), on the smallest and the largest supported iPhone, and once at the largest text size (`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`; reset with `large`).
4. Hand the screenshots and this file to a fresh reviewer agent and ask what looks wrong; for motion, hand it the code too, since a screenshot can't show it. Fix and repeat until it has nothing left but nitpicks. The builder is too generous grading its own work.
5. Put the final screenshots in the pull request description.

Screenshots prove layout, not feel. Motion, gestures and haptics are judged on a release build on a real iPhone (the simulator fires no haptics), so a pull request that adds any lists what still needs that check, for the maintainer to do.

The app is dark only (`userInterfaceStyle: "dark"` in `app.json`) and phone only (`supportsTablet: false`): don't spend time checking light mode or iPad. There are no light tokens.

## Platform

iOS first. Android renders but is second: SF Symbols draw nothing there (their box stays empty), glass falls back to blur. Prefer the native control to a custom one:

- Headers are native. The Screen's title is `Stack.Screen`'s `title`, never an `H1` at the top of the content. Options are `headerTransparent: true` and `headerBackButtonDisplayMode: "minimal"`, with actions as SF Symbol items or menus through `unstable_headerRightItems` (`app/(tabs)/(home)/index.tsx`) or `Stack.Toolbar`. No hand-built header rows.
- Content Screens scroll in a `ScrollView` with `contentInsetAdjustmentBehavior="automatic"`, so content sits under the transparent header and above the tab bar. Gutters and gaps go on `contentContainerClassName`, not `className`.
- List Screens (anything that maps rows of data) use `LegendList` from `@legendapp/list`, as the Arnold Conversation does, with the same `contentInsetAdjustmentBehavior` and a `refreshControl`.
- Secondary flows are sheets: a route with `presentation: "formSheet"` or `"modal"`. A `Modal` with `presentationStyle="pageSheet"` is for a picker that belongs to one Screen (the exercise picker in `workout-session-view.tsx`).
- Liquid Glass comes from `Button`, switched on `GLASS_ENABLED` with a fallback for older iOS. Cards are flat, not glass. Never build your own glass or blur surface.

## Tokens

Every Token lives in one file, `packages/design-tokens/src/tokens.css` (`@fitme/design-tokens`, ADR 0009). Mobile's `global.css` imports it and only maps the font roles to the font files the app bundles; the site imports it too (its own stylesheet only adds `display-1` / `display-2`); so does web, whose `globals.css` only maps the font roles to its `next/font` fonts. Code is the source of truth and Figma follows it:

- **Changing a Token**: edit `tokens.css`, never an app's stylesheet. The same PR updates the matching Figma variable in the `Fitme` file (named like the Token minus its prefix: `--color-primary` is `Color/primary`) through the Figma MCP, and the tables below.
- Dark only: one value per Token, no `@variant light` / `@variant dark`, no light values anywhere.
- Colors are hex, 8-digit where there's alpha, so a value compares with Figma as a plain string.
- Code that needs a Token's value at runtime reads its `--color-*` variable (`useCSSVariable("--color-foreground")`), never a hex copy.

## Color

| Token                    | Value       | Use                                                                    |
| ------------------------ | ----------- | ---------------------------------------------------------------------- |
| `background`             | `#1f1d20`   | Screen background                                                      |
| `foreground`             | `#fafafa`   | Body text                                                              |
| `card`                   | `#171717`   | Card surface (`Card`, `MenuList`)                                      |
| `card-foreground`        | `#fafafa`   | Text on `card`                                                         |
| `popover`                | `#171717`   | Menus and popovers (shadcn set; unused on mobile so far)               |
| `popover-foreground`     | `#fafafa`   | Text on `popover` (unused on mobile so far)                            |
| `primary`                | `#c0ff38`   | The brand (lime): H1, H2, card titles, the main action, the active tab |
| `primary-foreground`     | `#0a0a0a`   | Text on a lime fill (dark, not white)                                  |
| `secondary`              | `#27272a`   | Secondary surfaces and buttons                                         |
| `secondary-foreground`   | `#fafafa`   | Text on `secondary`                                                    |
| `muted`                  | `#262626`   | Quiet surfaces                                                         |
| `muted-foreground`       | `#a1a1a1`   | Secondary text: captions, metadata, hints                              |
| `accent`                 | `#262626`   | Pressed and hover highlights                                           |
| `accent-foreground`      | `#fafafa`   | Text on `accent`                                                       |
| `destructive`            | `#ff6467`   | Delete and error, nothing else                                         |
| `destructive-foreground` | `#0a0a0a`   | Text on a `destructive` fill (shadcn set; no Primitive draws one)      |
| `border`                 | `#ffffff1a` | Separators and row dividers (`border-border`, often `border-hairline`) |
| `input`                  | `#ffffff57` | Field stroke (`Input`, `Textarea`)                                     |
| `ring`                   | `#fafafa`   | Focused field stroke (`Input`, `Textarea`), web and site focus ring    |

- **Contrast.** Three values deliberately differ from the palette mobile shipped with (FIT-215), which fell short of WCAG: `input` went from `#ffffff26` (about 1.6:1) to `#ffffff57`, at least 3:1 on `background` and `card` (1.4.11, component boundaries); `ring` went from `#737373` to `#fafafa`, so focus still shows next to the stronger `input` stroke (about 5:1 against it); and `destructive-foreground` went from `#fafafa` (2.8:1 on `destructive`) to `#0a0a0a` (6.9:1, AA for text), like `primary-foreground` on the lime. `destructive` itself stays, so error text in `destructive` keeps about 5.8:1 on `background` and 6.2:1 on `card`. No red can carry white text at 4.5:1 and also be error text at 4.5:1, and dark text on red doesn't look right, so nothing draws on a `destructive` fill (FIT-248): the destructive `Button` and `Badge` are `destructive` text on `secondary` (about 5.2:1), as iOS draws a destructive role in a bordered or glass style. `destructive-foreground` is kept on purpose, for the shadcn / react-native-reusables set, with its floor. The contrast tests in `packages/design-tokens/src/__tests__/tokens.test.ts` hold these floors: a Token change that drops below one fails them. On iOS the destructive Button is the prominent style tinted `secondary`, which fills with the tint itself, so glass, the solid fallback, web and site all put the label on `secondary` (measured 5.16:1 on iOS). Regular glass and `bordered` draw their own lighter grey (about 3.8:1 and 2.6:1 under the red label), so destructive never uses them.
- In `className` use token names only (`text-muted-foreground`, `bg-background`). No hex, `rgb()` or `hsl()` in `className` or `style`.
- A color prop that isn't part of `style` on a React Native component gets its `…ClassName` prop with an `accent-` class: `<ActivityIndicator colorClassName="accent-foreground" />`, `tintColorClassName`, `backdropColorClassName="accent-background"`, `placeholderTextColorClassName` (`components/ui/input.tsx`). `className="text-…"` sets nothing there.
- Anything else that wants a color string (`@expo/ui` SwiftUI modifiers, a navigation theme, an SVG `fill`) gets a resolved token: `useSwiftUITheme()` from `components/ui/swift-ui.tsx`, or `useResolveClassNames("text-primary").color` from `uniwind`.
- Lime is the accent, not the paint. One lime action per Screen; everything else is `secondary` or `ghost`.
- A new color is a new Token in `@fitme/design-tokens` (see [Tokens](#tokens)), never a literal in an app.
- The navigation theme and the tab bar tint come from `useNavigationTheme()` (`hooks/navigation-theme.ts`): React Navigation's dark theme with `background` and `primary` read from the tokens. The brand sign (`components/brand/sign.tsx`) fills from `--color-primary`.

## Type

Text is set in Apple's HIG text styles (iOS, default Large size), one utility per style from `@fitme/design-tokens`. Each sets the family, weight, size and line height together, with letter spacing 0 (Apple's tracking is tuned for SF Pro, not Nunito Sans). `text-<style>` is the HIG's Regular weight and `text-<style>-emphasized` its Emphasized weight, in Nunito Sans. The same class names work on mobile, web and site; each app maps the font roles (`--font-nunito-sans-regular` / `-semibold` / `-bold`, `--font-ibm-plex-mono` / `-semibold`) to the font it loads (mobile: the bundled font files, in `global.css`).

| Class                                       | Size / line height (pt) | Regular  | Emphasized |
| ------------------------------------------- | ----------------------- | -------- | ---------- |
| `text-large-title` / `-emphasized`          | 34 / 41                 | Regular  | Bold       |
| `text-title-1` / `-emphasized`              | 28 / 34                 | Regular  | Bold       |
| `text-title-2` / `-emphasized`              | 22 / 28                 | Regular  | Bold       |
| `text-title-3` / `-emphasized`              | 20 / 25                 | Regular  | Semibold   |
| `text-headline` / `-emphasized`             | 17 / 22                 | Semibold | Semibold   |
| `text-body` / `-emphasized`                 | 17 / 22                 | Regular  | Semibold   |
| `text-callout` / `-emphasized`              | 16 / 21                 | Regular  | Semibold   |
| `text-subhead` / `-emphasized`              | 15 / 20                 | Regular  | Semibold   |
| `text-footnote` / `-emphasized`             | 13 / 18                 | Regular  | Semibold   |
| `text-caption-1` / `-emphasized`            | 12 / 16                 | Regular  | Semibold   |
| `text-caption-2` / `-emphasized`            | 11 / 13                 | Regular  | Semibold   |

Mono is IBM Plex Mono, for numbers that line up in columns (reps, weights, timers, stats): `text-mono-<style>` (Regular) and `text-mono-<style>-semibold` at five of the sizes above, `title-2`, `body`, `subhead`, `footnote` and `caption-1`. Those are the only Mono styles: mobile bundles IBM Plex Mono Regular and SemiBold only.

Each text Primitive is one HIG style and one color. `H1`–`H4`, `P`, `Muted` and the rest in `components/ui/typography` are the same map as `Text`'s `variant` (`H1` is `variant="h1"`, `Muted` is `variant="muted"`), `TEXT_VARIANTS` in `components/ui/text.tsx`:

| Role                                   | Class                                           | Color              | Primitive                                    |
| -------------------------------------- | ----------------------------------------------- | ------------------ | -------------------------------------------- |
| Hero or empty-state title              | `text-large-title-emphasized`                   | `primary`          | `H1` (`components/ui/typography`)            |
| Section title                          | `text-title-1-emphasized`                       | `primary`          | `H2`                                         |
| Card or group title                    | `text-title-2-emphasized`                       | `foreground`       | `H3` (`CardTitle` too, in `primary`)         |
| Row title, emphasized line             | `text-title-3-emphasized`                       | `foreground`       | `H4`                                         |
| Intro line under a title               | `text-title-2`                                  | `muted-foreground` | `Lead`                                       |
| Strong line in running text            | `text-headline`                                 | `foreground`       | `Large`                                      |
| Body                                   | `text-body`                                     | `foreground`       | `Text` (`components/ui/text`), `P`           |
| Quote                                  | `text-body`, with a `border` rule on the left   | `foreground`       | `BlockQuote`                                 |
| Small strong label                     | `text-subhead-emphasized`                       | `foreground`       | `Small`                                      |
| Secondary line                         | `text-subhead`                                  | `muted-foreground` | `Muted`                                      |
| Inline code                            | `text-mono-subhead-semibold`, on `muted`        | `foreground`       | `Code`                                       |
| Button label                           | `text-subhead-emphasized`, `text-body-emphasized`, `text-title-3-emphasized` | by `variant` | `Button` (by `size`)  |
| Badge label                            | `text-footnote-emphasized`                      | by `variant`       | `Badge`                                      |
| Table header / cell                    | `text-subhead-emphasized` / `text-subhead`      | `foreground`       | `TableHead` / `TableCell`                    |
| Metadata, captions                     | `text-footnote`, `text-caption-1`               |                    | `Text` with the class                        |
| Numbers in columns                     | `text-mono-body` (headers `-semibold`, or Regular in `primary`) |      | `Text` with the class                        |

- Text gets exactly one text style. No `font-*` weight or family class, `leading-*` or `tracking-*` next to it, and no `font-bold` to make a label heavier: pick the `-emphasized` style. Hierarchy within one role comes from Regular vs Emphasized and `text-muted-foreground`, not from another size.
- Headings come from `H1`–`H4`: they carry the style, the color and the heading role for VoiceOver. Don't rebuild one from `Text` and classes. `Text`'s `variant="h1"` gives the same style and role, but `Text` also takes the text style of the Primitive it sits in (`TextClassContext`), which a heading shouldn't, so use `H1`–`H4`.
- A Primitive that holds text (`Badge`, `TableHead`, `TableCell`, `AvatarFallback`, `AccordionTrigger`) hands its style and color to the `Text` inside it: write `<Badge><Text>3</Text></Badge>`, with no text classes on the `Text`.
- Never use an arbitrary size or leading (`text-[13px]` is `text-footnote`, `[15px]` is `text-subhead`, `[17px]` is `text-body`), Tailwind's default scale (`text-sm`, `text-lg`) or an inline `fontSize`. Where a native prop wants a font (SwiftUI's `font` modifier, a header's `headerLargeTitleStyle`, markdown styles), resolve a style: `useSwiftUIFont("text-body-emphasized")` from `components/ui/swift-ui.tsx`, or `useResolveClassNames("text-title-1-emphasized")` from `uniwind`.
- Merge classes with `cn()` from `~/lib/utils`, never `clsx` or `twMerge` directly: it knows the text styles, so a later style replaces an earlier one (and any font, weight, size, leading or tracking class) and keeps the text color.
- Write class names out in full. uniwind only sees literal classes, so `` `text-${color}` `` silently styles nothing: pick from a map or a ternary of full names.
- Changing a text style means editing `tokens.css` (the `--text-*` sizes or the `@utility` blocks) and the matching Figma text style in the same PR.

## Size

Button heights are Apple's iOS 27 kit's (`Button - Liquid Glass`: Small, Medium, Large), as the Figma Button set's `Size` variables are (FIT-366, FIT-368). A circle's diameter equals its pill's height, as in the kit. Our labels are taller than the kit's, so a native style would grow around them. The mobile `Button` (`frameModifiers` in `components/ui/button.tsx`) trims a text label by how far its line box overhangs the kit's (`LABEL_OVERHANG`, negative vertical padding: it draws unclipped and centered, and the button still grows with Dynamic Type or a wrapped label), and frames an icon (square, in a circle) or hosted views at the token minus the padding the style adds (`NATIVE_PADDING`: 10 / 14 / 30 pt, the same for pills and circles, Liquid Glass and iOS 27's solid styles; the solid styles before iOS 26 weren't measured). A `ghost` Button and a painted circle (below iOS 17) have no style to pad them, so they take the token itself. Web and site take the tokens as they are (`Size/button-pill-default` in Figma).

| Token                          | Value | `Button`                                   | Measured on iOS 27 (pt) |
| ------------------------------ | ----- | ------------------------------------------ | ----------------------- |
| `--size-button-pill-sm`        | 28px  | `size="sm"` (`controlSize(.small)`, Small) | 28.00                   |
| `--size-button-pill-default`   | 34px  | `size="default"` (`.regular`, Medium)      | 34.00                   |
| `--size-button-pill-lg`        | 50px  | `size="lg"` (`.large`, Large)              | 50.00                   |
| `--size-button-circle-sm`      | 28px  | `shape="circle" size="sm"`                 | 28.00                   |
| `--size-button-circle-default` | 34px  | `shape="circle"`                           | 34.00                   |
| `--size-button-circle-lg`      | 50px  | `shape="circle" size="lg"`                 | 50.00                   |

On iOS 27 `.large` and `.extraLarge` draw the same box. Web and site pills take the kit's horizontal padding: `px-2.5`, `px-3`, `px-5`. Re-measure `NATIVE_PADDING` and `LABEL_OVERHANG` when the label fonts, the control sizes or the iOS version change: render every size, shape and variant in a throwaway `__DEV__` screen, with Liquid Glass and with the solid styles (`GLASS_ENABLED` forced off), log the `onLayout` height of a `View` around each Button, and fix the values until each one lands on its token. The heights themselves change only with the kit: then update `tokens.css`, the Figma `Size` variables and this table together.

## The literal check

No `.tsx` file in mobile, web or site hardcodes a color or an off-scale size, and CI keeps it that way: `pnpm literal-check` (`packages/design-tokens/src/literal-check.ts`, run in the `checks` job of `.github/workflows/unit-tests.yml`) fails on any of these in a string literal, naming the file, line, column and literal, and the token it matches when there is one:

- a hex color (`#c0ff38`, `#fff`, `#ffffff1a`), arbitrary properties included (`[color:#fff]`), `rgb()`, `rgba()`, `hsl()`, `hsla()`;
- an arbitrary `text-[…]`, `leading-[…]`, `rounded-[…]` (any corner), or spacing value: `p-[…]`, `m-[…]` (every side, negatives too), `gap-[…]`, `space-x/y-[…]`, with or without a variant (`active:rounded-[10px]`).

What it leaves alone, and why:

- Comments, JSX text (copy like "Order #1"), URL fragments (`page#faq`), and the whole value of `href`, `id`, `testID` and `nativeID`, wrapped in `{…}` or built from a template too (`` href={`${path}#add`} ``): URLs, anchors and ids are never style, so no rule applies to them (`href="/colors/rgb(1,2,3)"`, `testID="rounded-[10px]"` pass). It reads the code through TypeScript's parser, so only real string literals count (quoted strings, JSX attribute values, the static parts of template literals).
- Token references: the CSS-variable shorthand in parentheses (`h-(--size-button-pill-default)`) has no brackets, and a bracket that holds exactly one variable (`[var(--x)]`, `[--x]`) names a token, not a value. A fallback (`p-[var(--x,13px)]`) hides a value, so it fails.
- Other arbitrary utilities (`w-[…]`, `h-[…]`, `max-w-[80%]`, `grid-cols-[…]`, `ring-[…]`): sizes the scales don't cover; prefer a numeric step where one fits.
- Tests (`__tests__/`, `*.test.tsx`), native projects and build output: fixtures and generated code, not UI. `.ts` files aren't read either, so a color constant in one isn't caught: native props read the tokens through `useCSSVariable` or `useResolveClassNames` instead (see [Color](#color)), never a TypeScript copy.
- Named colors (`"white"`) and Tailwind's default palette (`text-blue-400`) aren't caught; they're still not tokens, so don't use them.

**Allowlist.** `ALLOWLIST` in `literal-check.ts` exempts a whole file, with a reason each. It is empty: every literal found when the check landed moved to a token (FIT-202), the syntax theme of `components/markdown/code-block.tsx` is imported from `react-syntax-highlighter` rather than written out, and the brand sign is the only brand artwork with a fill. An entry is for a color or size that genuinely can't be a token (third-party artwork with its own colors, a vendored syntax theme), never for a value that just hasn't moved yet. An entry whose file has no literal left fails the check, so the list can't go stale.

## The text check

No mobile screen hardcodes text: everything the User reads or hears comes from the catalogs in `@fitme/i18n` through `t()` (`i18n.t` outside React). `pnpm text-check` (`packages/i18n/src/text-check.ts`, run in the `checks` job of `.github/workflows/unit-tests.yml` next to the literal check) reads every `.ts` and `.tsx` under `apps/mobile` through TypeScript's parser and fails on text holding a letter (any script), printing `file:line:column  text`:

- JSX text (`<Text>Save</Text>`);
- a string literal, or a template literal's static part, shown as a JSX child (`{"Save"}`, `{done ? "Done" : "Save"}`), as the value of a text prop (`title`, `subtitle`, `label`, `placeholder`, `description`, `message`, `hint`, `text`, `accessibilityLabel`, `accessibilityHint`, `aria-label`, `alt`, `headerTitle`, `headerBackTitle`, `tabBarLabel`, …: `TEXT_PROPS`), as an object property of one of those names (`options={{ title: "Settings" }}`, an alert button's `text`), or as `Alert.alert` / `Alert.prompt`'s title or message.

A literal counts when it is the value or part of it (parentheses, either branch of a `? :`, `+`, `&&`, `||`, `??`, a template, `as`, `satisfies`), so a catalog key (`t("home.title")`), a condition (`kind === "plan" ? …`) and any other function's argument never count. Ignored: tests (`__tests__/`, `*.test.ts(x)`, `test-utils/`, `e2e/`), comments, empty or whitespace-only text, text without a letter (`·`, `—`, `+`, `100%`), and every prop or property not in `TEXT_PROPS` (`testID`, `nativeID`, `href`, `className`, route names, analytics event names). Text that isn't language (an email address, a URL) goes in a named constant (`SUPPORT_EMAIL` in `app/support/index.tsx`), and a class list never goes in a property named like a text prop (Badge's variants use `labelClass`, not `text`). It's a TypeScript-AST check like the literal check rather than `i18next-cli`'s lint: no new tool next to Biome, and the same allowlist and output.

**Allowlist.** `ALLOWLIST` in `text-check.ts` exempts a whole file, with a reason each. It is empty: every screen took its text from the catalogs when the check landed (FIT-409). An entry is for text that genuinely isn't the app's to translate (a developer-only screen, a brand name drawn as artwork), never for text that just hasn't moved yet. An entry whose file has no hardcoded text left fails the check, so the list can't go stale.

## Spacing and layout

- Screen gutters and gaps between sections use the spacing Tokens: `xs` 8, `sm` 16, `md` 24, `lg` 32 (`px-md`, `gap-md`, `p-md`).
- Corners use the radius Tokens: Tailwind's default scale (`rounded-xs` 2, `-sm` 4, `-md` 6, `-lg` 8, `-xl` 12, `-2xl` 16, `-3xl` 24, `-4xl` 32), with no per-app overrides, plus `rounded-card` 24 for cards and `rounded-full` (9999) for pills and circles.
- Inside a component, use Tailwind's numeric steps (`gap-2`, `px-3`, `py-2`). Never an arbitrary value (`p-[13px]`, `rounded-[10px]`). A token the scale doesn't name is referenced by its variable, in parentheses: `h-(--size-button-pill-default)`.
- The spacing Tokens shadow Tailwind's named sizes: `max-w-md` is 24 px here, not 28 rem. Use the numeric step (`max-w-112`, `max-w-80`).
- `VStack` and `HStack` default to `items-center justify-center gap-4`. Centered is right for empty states and single-message Screens and wrong for content: lists, cards and forms pass `items-stretch` (or `items-start`). Everything ending up centered is the most common way generated UI looks off.
- Rows in a list are divided by `Separator` or `border-border border-b`, not wrapped in a card each. Never nest a `Card` in a `Card`.
- A rounded surface that isn't a `Card` adds `border-continuous` (iOS's smooth corners), as `Card` does.

## Primitives

Look in `components/ui/` before building anything. The ones that trip agents up:

- **`Button`** (`components/ui/button.tsx`, the Figma `Button` set) is a native SwiftUI button; web and site use the same variants, sizes, shapes and icon positions with solid fills:
  - `variant`: `default` (lime, prominent glass), `secondary` (regular glass), `destructive` (prominent glass tinted `secondary`, with a `destructive` label and icon and SwiftUI's `role: .destructive`) or `ghost` (plain, no fill). Without Liquid Glass (before iOS 26) the same mapping uses the solid native styles (`borderedProminent`, `bordered`).
  - `size`: `sm`, `default` or `lg`, at the native heights in [Size](#size). The label is the size's Emphasized text style: `text-subhead-emphasized`, `text-body-emphasized`, `text-title-3-emphasized`.
  - `shape`: `pill` (default) or `circle`. A circle takes `icon` and `accessibilityLabel` (both required, the types enforce it) and shows no label. Native circles need iOS 17 (`buttonBorderShape(.circle)`); below it the Button paints its own circle at the `--size-button-circle-*` diameter (`NATIVE_CIRCLE_ENABLED` in `components/ui/swift-ui.tsx`).
  - `icon` (an SF Symbol name) and `iconPosition` (`leading`, the default, or `trailing`; the forward `arrow.right` trails).
  - A pill needs `label` (a string), or `children`: the older form, kept for views that aren't SF Symbols (the support page's brand logos, each in a 44 pt-wide view so it's a full tap target). A lone icon is a circle. Use `isLoading` while its action runs; the button keeps its size. It spans its container's width unless it's a circle or `ghost` (or you pass `fill`). `className` only lays it out; the label's font and color come from `variant` and `size`, unless `contentColorClassName` (a `text-…` class) recolors the label and icon, as the lime "Add Set" on a `secondary` pill does.
  - **Web and site:** `default` and `secondary` have the matching solid token fill and `*-foreground` text, `destructive` is the `secondary` fill with `destructive` text; `ghost` is transparent with `foreground` text and `muted` on hover. No glass, blur or translucent fills. All use `rounded-full`, and sizes select the same Emphasized styles above. Pill heights use `h-(--size-button-pill-sm/default/lg)` (each suffix is written out in code); circles use `size-(--size-button-circle-sm/default/lg)` for both dimensions. These are Tailwind v4 CSS-variable references, not new arbitrary measurements. `className` is for layout (`w-full`, `mt-*`, `self-*`), never for overriding geometry, fill or text style. Both Buttons merge caller classes first (`cn(className, buttonVariants(...))`), so the Primitive owns those styles. With `asChild`, the composed child must have no `className` either: Radix Slot appends it without merging, so put layout classes on Button. To check the rule cheaply, grep the two Button implementations for this merge order.
  - Web/site pill text is `children`; `icon` accepts a Tabler SVG component or a React element. Icons are decorative (`aria-hidden`), inherit the label color, and `iconPosition` defaults to `leading`. A circle requires `icon` and `aria-label`, forbids `children` and `iconPosition`, and uses a native `<button>`; the types enforce this. Both apps support `asChild` for pill links, including an icon beside the link's content; it requires a single React element, rejects `disabled`, and the rendered anchor keeps normal link keyboard behavior. Use Button composition to style links; `buttonVariants` is private. Native buttons default to `type="button"`, accept normal DOM props, and show a `ring` focus ring with a background-colored offset on keyboard focus. Removed shadcn values (`outline`, `link`, `icon`, `icon-sm`, `icon-xs`) are rejected by each app's `button.typecheck.tsx` cases. Use `ghost` or a plain link instead of `link`.
- **`Card`** is a flat `card` surface with the `card` radius (24) and `sm` padding (16), with no glass, border or shadow. `variant` is `default` or `ghost` (transparent, same radius and padding, for grouped content that shouldn't read as a surface), and it's the only styling prop Card needs: `className` only lays out its children (`gap-sm`, `flex-1`), never sets a background, radius or padding. Card already pads its content, so `CardHeader` / `CardContent` add none. Rows that run edge to edge (a settings list, History's months) go in `MenuList`, which has Card's fill and radius but no padding, divided by `Separator`.
- **`Badge`** is a small `rounded-full` pill: `variant` is `default` (lime, `primary`), `secondary` or `muted`, each a token fill and its foreground, `destructive`, `destructive` text on `secondary` like the destructive Button, or `ghost`, no fill and a `muted-foreground` label. `icon` (an SF Symbol, drawn by `SymbolImage`) goes before the label, or after it with `iconPosition="trailing"`, `gap-1` from it, in the label's text style (Footnote Emphasized) and color, except ghost's, which is `foreground`; it's decorative, so VoiceOver reads only the label. `asChild` takes no `icon`. Like `Card`, it owns its look: `className` only places it, a caller's fill, radius, padding or gap is dropped.
- **`Separator`** is a one-point `border` line; `orientation="vertical"` for a column. **`Avatar`**'s fallback is a `muted` circle with Headline text in `muted-foreground`.
- **`Table`** (`TableHeader`, `TableRow`, `TableHead`, `TableCell`, …) divides rows with `border`, puts the header and footer on `muted` and sets cells in Subhead. Arnold's markdown tables render with it (`components/markdown/chat-markdown.tsx`). **`Accordion`** has a Body Emphasized trigger with an SF Symbol `chevron.down`. Neither has another call site yet.
- **`Switch`** is a native SwiftUI `Toggle`, with its own haptic.
- **Native controls** keep the system look and take their colors from the tokens through `useSwiftUITheme()`, never a literal: on and selected states are `primary` (`tint` on `Switch`, `Slider`, `Picker`, `Select`, `WheelSelect`, `AlertDialog`'s non-destructive actions and anything SwiftUI inside a `Dialog`; `RadioGroup` tints its `Form`, since the inline Picker ignores its own `tint` and draws a blue checkmark; a wheel `Picker` ignores `tint` too, so its selected row's text is set in `primary` with `foregroundStyle`), secondary text is `muted-foreground` (`RadioGroup`'s header and footer), and a `RadioGroup`'s rows sit on `card` with `border` separators, like every other card. Menus take no `tint`, because it would also repaint every item's icon, the destructive item's included: a `DropdownMenu`'s text button is a `primary` label of its own and an icon-only one is `foreground`, and `ContextMenu` leaves its items to the system. What the system draws itself stays the system's: a destructive role (menu items, alert actions) is system red, not `destructive`, the wheel's selection band is the system's gray, and the segmented `Tabs` keep the native gray selected segment: they ignore `tint`, `foregroundStyle` and `controlSize` alike and `@expo/ui` has no selected-segment color on iOS, so this is an accepted exception (FIT-208), and "changing `--color-primary` retints every native control" means every control the platform lets us tint. `GenderSwitch` isn't native: it's React Native cards on token classes, with a `border` stroke and a `muted-foreground` ring that turn `primary` when selected. The Figma `Native` section on the Components page has one iOS 27 kit instance per wrapper.
- **Icons** are SF Symbols, and only SF Symbols (no icon library): `icon` on `Button`, `sfSymbol` items in headers, `SymbolImage` (`components/symbol-image.tsx`) everywhere else. Give `SymbolImage` the text style and color of the text it sits next to (`className="text-footnote text-muted-foreground"`): the symbol takes the style's point size and weight, and the color token as its tint. `size` is only for a symbol that stands alone (an empty state's illustration). Names are typed (`SFSymbol`), and the app targets iOS 16.4, so check a new symbol's availability (SF Symbols app) before using it. Brand art isn't a symbol: keep it as an asset or SVG. Raster images use `expo-image` (`Image` from `~/components/tw`).
- **Forms** use `Input`, `Textarea`, `Label` and `ErrorMessage`, inside the keyboard handling `react-native-keyboard-controller` already provides (`KeyboardProvider` in `components/providers.tsx`). See `components/forms/`.
  - `Input` (at least 48 pt) and `Textarea` (at least 80 pt, text from the top), both growing with large text, are the same field: a transparent fill with an `input` stroke, `rounded-lg`, `sm` side padding and `text-body` in `foreground`, so it reads the same on `background` and on a `card`. The stroke is `ring` while focused and `destructive` with an error (which wins over focus); a field that isn't `editable`, or is `readOnly`, is dimmed. `variant="ghost"` keeps the box with a transparent stroke at rest (focus and error still draw theirs), for values that read as settled: a set row's locked inputs, and its logged values drawn in the same box. The placeholder is `muted-foreground` (`placeholderTextColorClassName`) and the caret `primary` (`selectionColorClassName`).
  - An `Input`'s or `Textarea`'s error goes in its `error` prop, never in an `ErrorMessage` next to it: a string shows under the field in `destructive` and VoiceOver reads it as the field's hint; `true` only turns the stroke `destructive`, for a form that shows the message elsewhere (a set row's errors go under the row). With react-hook-form, pass `fieldState.error?.message` from the `Controller`'s render.
  - `className` styles the field (`min-h-10 text-center text-mono-body` for a set cell); `containerClassName` lays out the field and its message together (`flex-1` in a row).
  - `Label` is `text-body-emphasized` in `foreground`, dimmed with `disabled`. `ErrorMessage` is `text-subhead` in `destructive` with the alert role, for errors that belong to a whole form or Screen (a failed save, a rejected code).

## Every Screen has four states

Design all four, not just the happy path:

- **Loading**: the native `ActivityIndicator` with `colorClassName="accent-foreground"` in the space the content will fill, or a `Button` with `isLoading` for an action. Never a blank Screen.
- **Empty**: a centered `VStack` with a title, one line saying what's missing and one lime action that fixes it (the no-active-plan state in `app/(tabs)/home/index.tsx`).
- **Error**: say what failed in plain words and offer a retry. A form field's `error` prop for its own message, `ErrorMessage` for the form's. Never show a raw error string or a stack.
- **Content**: what you were asked to build. Lists also get pull to refresh (`RefreshControl`).

## Feel

Load `animate-expo` for anything that moves; it holds the springs, curves and recipes. The rules that matter most:

- **Haptics** (`expo-haptics`) on moments that matter, one per user action, in the same frame as the visual, and never the only feedback: `notificationAsync(Success)` for a logged set or a finished workout, `selectionAsync()` for a custom stepper or picker that ticks. Native controls (`Switch`, pickers, date pickers) already tick; don't add another.
- **Destructive actions**: an irreversible one asks first (`AlertDialog` or the native `Alert`); a reversible one (removing a set mid-workout) acts at once and offers undo. Asking every time trains people to tap through.
- **Motion** is `react-native-reanimated`, short and quiet: press feedback 100–150 ms, small state changes 150–200 ms, sheets a ~300 ms spring, screen transitions the platform's default. Things enter with a fade plus a small translate (or a scale from 0.95), never `ease-in`, and springs don't overshoot (`dampingRatio: 1`) unless they follow a flick.
- **Animate only `transform` and `opacity`**, never width, height or margin.
- **Not everything animates**: what a User sees many times a session (tab switches, list rows as they scroll) doesn't. Never put an `entering` animation on list rows.
- **Shared values**: the React Compiler is on (`reactCompiler` in `app.json`), so new code reads and writes them with `.get()` / `.set()`, not `.value`.
- **Text reflows** at large sizes: never give a text container a fixed height, and let rows grow.

## Accessibility

- Tap targets are at least 44×44 pt. A standalone circle `Button` is `size="lg"` (50 pt): `default` (34 pt) and `sm` (28 pt) circles are for rows that are themselves the target and dense toolbars, like `sm` pills (28 pt). A small `Pressable` (a `SymbolImage` you tap) gets `hitSlop` up to 44 pt instead of a bigger visual.
- Every icon-only control has an `accessibilityLabel` (a circle `Button` won't type-check without one). Headings come from `H1`–`H4`, so VoiceOver finds them.
- Information is never color alone: a failed or completed set says so in text or a symbol too.
- Reduced motion ships with the animation, not later: `useReducedMotion()` or `reduceMotion: ReduceMotion.System`. Fewer and gentler, not zero: keep the opacity change, drop the movement.

## Reference

Copy patterns from these:

- `components/views/workout-session-summary-view.tsx`: spacing tokens, stretched stacks, `Separator` between rows, a pill call to action with an SF Symbol.
- `components/views/workout-session-view.tsx`: a `Card` per exercise (each holds its own sets table, so they aren't rows of one list), a `pageSheet` picker.
- `app/(tabs)/(home)/index.tsx`: a native header with an SF Symbol menu, pull to refresh, the empty state. Its `<Text>` button child is the older form.
- `components/chat/conversation.tsx`: a `LegendList`.

## Skills

The project skills in `.claude/skills/`, by when to load them:

| When                             | Mobile                                                                                       | Web and site                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unsure what it should look like  | `prototype`, rebuilt in React Native (see below)                                             | `prototype`                                                                                      |
| Building                         | `building-native-ui`, `uniwind`, `vercel-react-native-skills`                                | `frontend-design`, `pick-ui-library`                                                             |
| Adding motion, gestures, haptics | `animate-expo`                                                                               | `animate`, `animation-performance`                                                               |
| Stress-testing the states        | `break-ui`, data catalog only (see below)                                                    | `break-ui`                                                                                       |
| Polish and review                | `animate-expo`'s "Never ship" list; `apple-design` and `emil-design-eng` for principles only | `web-design-guidelines`, `emil-design-eng`, `apple-design`, `review-animations`, `mobile-native` |
| Auditing motion across the app   | `find-animation-opportunities`, `improve-animations`                                         | same                                                                                             |

- `prototype`, `pick-ui-library` and `review-animations` only run when asked for by name. `frontend-design` is a plugin skill, not in the repo. `web-design-guidelines` fetches its rules from GitHub, so it needs web access. `animation-vocabulary` turns a described effect into its name, for prompting; `ask-sonner` covers toasts on the web.
- `apple-design`, `emil-design-eng` and `review-animations` are written for the web: all their code is CSS and Framer Motion. On mobile take their principles and build them with `animate-expo`.
- `prototype` and `break-ui` drive their harness through the browser (URL params, keyboard keys, browser zoom). On mobile, rebuild the picker or the worst-case toggle in React Native, use the largest text size for zoom, and keep it out of production: anything under `app/` ships and can be deep-linked, so a harness route checks `__DEV__`.

## When a skill disagrees

These skills say something this file overrides, for this repo only:

- `building-native-ui`: "Tailwind is not supported, use inline styles", `PlatformColor` and hex colors: here everything is uniwind classes and Tokens. "Try Expo Go first": Expo Go can't run this app. Its `GlassView` / `BlurView` buttons and cards: use `Card` and `Button`.
- `vercel-react-native-skills`: "avoid multiple font sizes" and its hex grays: here it's Apple's scale and Tokens. Its gradient and `boxShadow` recipes: see [Don't](#dont). `StyleSheet` or NativeWind: uniwind.
- `apple-design`: thicker shadows and blur for depth, blur and gradient masks at scroll edges, animated blur: depth on mobile comes only from the Primitives and the native header, and blur is never animated.
- `emil-design-eng` / `review-animations`: a blur to bridge a crossfade: not on mobile.
- `animate-expo`'s hand-rolled bottom sheet recipe: use a `formSheet` route.

## Don't

- Gradients, drop shadows or glow as decoration; glass and the lime are the brand.
- Emoji in UI copy.
- Bare `Pressable` or `TouchableOpacity` styled to look like a button.
- Hand-rolled headers, tab bars or bottom sheets.
- Placeholder text ("Lorem ipsum", "Coming soon") or fake data in production. Worst-case fixtures and prototype pickers are fine behind `__DEV__`.
- `{count && <Row />}` when `count` can be `0` or a string can be `""`: React Native crashes rendering a bare `0` or `""` outside `Text`. Use `count > 0 &&` or a ternary.
- Exclamation marks in anything but a celebration ("Workout Complete!").

## Web and site

- `apps/web` uses shadcn-style Primitives in `components/ui/` (Tailwind v4, `cva`); add new ones with the shadcn CLI (`components.json`). It's on the shared tokens and dark only, like mobile, whatever the OS setting; Clerk's components get the tokens through `lib/clerk-appearance.ts` (Clerk has no variable for text on a danger fill, so an `elements` override there gives its solid danger buttons the destructive `Button`'s look: the `secondary` fill, `destructive` text and the Button's focus ring). Other `elements` overrides there cover what Clerk derives badly from the tokens (FIT-247): lime stays on Clerk's solid primary and `link` buttons (inline text links), its ghost buttons and the account modal's selected page take `foreground` like the web `ghost` Button; its neutral badges ("This device", "Primary") are `muted-foreground` on `muted`; its device icons are a `muted-foreground` chassis around a `muted` screen; and its section titles are capped at the content width, so the modal doesn't scroll sideways at 320 px. Its `cn()` knows the text styles; the dashboard is set in them, while the rest of web (its `components/ui/` Primitives included) still uses Tailwind's default sizes until those move.
- `apps/site` (marketing) has its own `components/ui/`, is dark only on the shared tokens, and uses the lime `primary`. Hero and page headings use its `text-display-1` (36/40) and `text-display-2` (30/36): plain font sizes outside the HIG set, so they are the one place `font-bold` and `tracking-tight` still sit next to a size. Everything else is the HIG text styles, as on mobile.
- Web and site icons come from `@tabler/icons-react` only. Let their stroke use `currentColor`: set color with a semantic text token (`text-primary`, `text-muted-foreground`) or inherit the surrounding text color. Match the adjacent text style with a standard Tailwind `size-*` step, or pass the icon to `Button` and let its glyph size follow `size`. Tabler's default stroke is 2; set `stroke` only when matching an existing icon that used another weight. Decorative icons use `aria-hidden`; an icon-only control needs an `aria-label`.
- The loop is the same: open the page with Playwright or Chrome DevTools, screenshot at 320 px and 1280 px wide (web and site with the OS in light mode too, to prove they stay dark), and have a fresh agent review the screenshots (see [Skills](#skills)). Playwright is a root devDependency, and the worktree setup installs its Chromium (`pnpm exec playwright install chromium-headless-shell` otherwise). Save Playwright MCP screenshots under the worktree's `.playwright-mcp/`: it refuses paths outside its allowed roots, `/tmp` included. Clear the browser's cookies before signing in, since a stale Clerk session from an earlier (or deleted) test User redirects away from `/sign-in`. Screenshots cover layout only: touch, viewport height, input zoom and safe areas only show on a real phone, so list what needs that check in the pull request.
