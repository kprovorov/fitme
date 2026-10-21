# UI

How agents build and check UI in Fitme. The mobile app is the product, and the bar is a native iOS app, not a web page in a phone frame. Most of this file is about `apps/mobile`; web and site are at the end.

Where a skill says otherwise, this file wins for this repo: [When a skill disagrees](#when-a-skill-disagrees) lists the known cases.

## Terms

- **Screen**: a route file under `apps/mobile/app/`. It owns the native header (`Stack.Screen` options), the data hooks, and the choice between loading, empty, error and content. _Avoid_: page, route component.
- **View**: a component a Screen renders with data passed as props, under `components/views/` or a feature folder (`components/plans/`, `components/chat/`). _Avoid_: container, widget.
- **Primitive**: a component in `components/ui/`. Screens and Views are built from Primitives, never from bare `react-native` controls when a Primitive exists. _Avoid_: atom, base component.
- **Token**: a semantic design value (color, type size, spacing, radius, font role), defined once in `@fitme/design-tokens` (`packages/design-tokens/src/tokens.css`) and imported by every app. _Avoid_: magic number, hard-coded value.

## See it before you ship it

Code that compiles isn't done. Every UI change is looked at, by you and then by someone who didn't write it:

1. Run the app on an iOS simulator (`pnpm ios`) and go to the changed Screen. Expo Go can't run this app (it has custom native modules), so it's always the dev build. If Xcode 27 refuses to target the simulator (it asks for a signing certificate), let it prebuild, then build with `xcodebuild -workspace FitmeProject.xcworkspace -scheme FitmeProject -configuration Debug -destination id=<UDID>`, install with `xcrun simctl install`, and open `exp+fitme-project://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` with `expo start --dev-client` running. The Maestro flows and subflows in `apps/mobile/e2e/` (sign-in, register) get you past auth.
2. Screenshot it (`xcrun simctl io booted screenshot /tmp/<name>.png`) and read the image. Fix what looks off, then take it again.
3. Check every state the Screen has (see [Every Screen has four states](#every-screen-has-four-states)), on the smallest and the largest supported iPhone, and once at the largest text size (`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`; reset with `large`).
4. Hand the screenshots and this file to a fresh reviewer agent and ask what looks wrong; for motion, hand it the code too, since a screenshot can't show it. Fix and repeat until it has nothing left but nitpicks. The builder is too generous grading its own work.
5. Put the final screenshots in the pull request description.

Screenshots prove layout, not feel. Motion, gestures and haptics are judged on a release build on a real iPhone (the simulator fires no haptics), so a pull request that adds any lists what still needs that check, for the maintainer to do.

The app is dark only (`userInterfaceStyle: "dark"` in `app.json`) and phone only (`supportsTablet: false`): don't spend time checking light mode or iPad. There are no light tokens.

## Platform

iOS first. Android renders but is second: icons fall back to Lucide, glass falls back to blur. Prefer the native control to a custom one:

- Headers are native. The Screen's title is `Stack.Screen`'s `title`, never an `H1` at the top of the content. Options are `headerTransparent: true` and `headerBackButtonDisplayMode: "minimal"`, with actions as SF Symbol items or menus through `unstable_headerRightItems` (`app/(tabs)/home/index.tsx`) or `Stack.Toolbar` (`app/(tabs)/coach/chats.tsx`). No hand-built header rows.
- Content Screens scroll in a `ScrollView` with `contentInsetAdjustmentBehavior="automatic"`, so content sits under the transparent header and above the tab bar. Gutters and gaps go on `contentContainerClassName`, not `className`.
- List Screens (anything that maps rows of data) use `LegendList` from `@legendapp/list`, as the Coach conversation does, with the same `contentInsetAdjustmentBehavior` and a `refreshControl`. The `FlatList`s in history and the Coach's chat list are the older pattern.
- Secondary flows are sheets: a route with `presentation: "formSheet"` or `"modal"`. A `Modal` with `presentationStyle="pageSheet"` is for a picker that belongs to one Screen (the exercise picker in `workout-session-view.tsx`).
- Liquid Glass comes from the Primitives (`Card`, `Button`), switched on `GLASS_ENABLED` with a fallback for older iOS. Never build your own glass or blur surface.

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
| `card`                   | `#171717`   | Surface that isn't glass                                               |
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
| `destructive-foreground` | `#fafafa`   | Text on `destructive`                                                  |
| `border`                 | `#ffffff1a` | Separators and row dividers (`border-border`, often `border-hairline`) |
| `input`                  | `#ffffff26` | Input borders (`Textarea`)                                             |
| `ring`                   | `#737373`   | Focus ring (web only)                                                  |

- In `className` use token names only (`text-muted-foreground`, `bg-background`). No hex, `rgb()` or `hsl()` in `className` or `style`.
- A color prop that isn't part of `style` on a React Native component gets its `…ClassName` prop with an `accent-` class: `<ActivityIndicator colorClassName="accent-foreground" />`, `tintColorClassName`, `backdropColorClassName="accent-background"`, `placeholderTextColorClassName` (`components/ui/input.tsx`). `className="text-…"` sets nothing there.
- Anything else that wants a color string (`@expo/ui` SwiftUI modifiers, a navigation theme, an SVG `fill`) gets a resolved token: `useSwiftUITheme()` from `components/ui/swift-ui.tsx`, or `useResolveClassNames("text-primary").color` from `uniwind`.
- Lime is the accent, not the paint. One lime action per Screen; everything else is `secondary`, `outline` or `ghost`.
- A new color is a new Token in `@fitme/design-tokens` (see [Tokens](#tokens)), never a literal in an app.
- The literal `#C0FF38` and `#1F1D20` in `app/(tabs)/_layout.tsx`, `components/providers.tsx` and the workout session Screens are old debt. Don't copy them.

## Type

The scale is Apple's text styles (iOS, default Large size; letter spacing 0), defined as Tokens in `@fitme/design-tokens`. Fonts: Nunito Sans for UI (`font-nunito-sans-regular` / `-semibold` / `-bold`), IBM Plex Mono (`font-ibm-plex-mono` / `-semibold`) for numbers that line up in columns, like set counts. Those five font roles are Tokens too; each app maps them to the font it loads (mobile: the bundled font files, in `global.css`).

| Token / class      | Size / line height (pt) |
| ------------------ | ----------------------- |
| `text-large-title` | 34 / 41                 |
| `text-title-1`     | 28 / 34                 |
| `text-title-2`     | 22 / 28                 |
| `text-title-3`     | 20 / 25                 |
| `text-headline`    | 17 / 22                 |
| `text-body`        | 17 / 22                 |
| `text-callout`     | 16 / 21                 |
| `text-subhead`     | 15 / 20                 |
| `text-footnote`    | 13 / 18                 |
| `text-caption-1`   | 12 / 16                 |
| `text-caption-2`   | 11 / 13                 |

| Role                       | Class                             | Primitive                          |
| -------------------------- | --------------------------------- | ---------------------------------- |
| Hero or empty-state title  | `text-large-title`                | `H1` (`components/ui/typography`)  |
| Section title              | `text-title-1`                    | `H2`                               |
| Card or group title        | `text-title-2`                    | `H3`, `CardTitle`                  |
| Row title, emphasized line | `text-title-3`                    | `H4`                               |
| Body                       | `text-body`                       | `Text` (`components/ui/text`), `P` |
| Secondary line             | `text-subhead`                    | `Muted`                            |
| Metadata, captions         | `text-footnote`, `text-caption-1` | `Text` with the class              |

- Pick the size by role from the table; within one role, hierarchy comes from weight (`-semibold`, `-bold`) and `text-muted-foreground`, not from another size.
- Headings come from `H1`–`H4`: they carry the font, the color and the heading role for VoiceOver. Don't rebuild one from `Text` and classes, and don't use `Text`'s `variant="h1"` and friends.
- Never use an arbitrary size (`text-[13px]` is `text-footnote`, `[15px]` is `text-subhead`, `[17px]` is `text-body`) or Tailwind's default scale (`text-sm`, `text-lg`).
- Merge classes with `cn()` from `~/lib/utils`, never `clsx` or `twMerge` directly: it's the one that knows the type scale (see its comment).
- Write class names out in full. uniwind only sees literal classes, so `` `text-${color}` `` silently styles nothing: pick from a map or a ternary of full names.

## Spacing and layout

- Screen gutters and gaps between sections use the spacing Tokens: `xs` 8, `sm` 16, `md` 24, `lg` 32 (`px-md`, `gap-md`, `p-md`).
- Corners use the radius Tokens: Tailwind's default scale (`rounded-xs` 2, `-sm` 4, `-md` 6, `-lg` 8, `-xl` 12, `-2xl` 16, `-3xl` 24, `-4xl` 32), with no per-app overrides, plus `rounded-card` 16 for cards.
- Inside a component, use Tailwind's numeric steps (`gap-2`, `px-3`, `py-2`). Never an arbitrary value (`p-[13px]`, `rounded-[10px]`).
- The spacing Tokens shadow Tailwind's named sizes: `max-w-md` is 24 px here, not 28 rem. Use the numeric step (`max-w-112`, `max-w-80`).
- `VStack` and `HStack` default to `items-center justify-center gap-4`. Centered is right for empty states and single-message Screens and wrong for content: lists, cards and forms pass `items-stretch` (or `items-start`). Everything ending up centered is the most common way generated UI looks off.
- Rows in a list are divided by `Separator` or `border-border border-b`, not wrapped in a card each. Never nest a `Card` in a `Card`.
- A rounded surface that isn't a `Card` adds `border-continuous` (iOS's smooth corners), as `Card` does.

## Primitives

Look in `components/ui/` before building anything. The ones that trip agents up:

- **`Button`** is a native SwiftUI button. Pass `label` (a string), `systemImage` (an SF Symbol name) and `shape="pill"` for calls to action; `variant` is `default` (lime), `secondary`, `outline`, `ghost`, `destructive` or `link`. Use `isLoading` while its action runs, and `accessibilityLabel` on every icon-only button. It spans its container's width unless it's an icon or link button (or you pass `fill={false}`). `className` only lays it out; the label's font and color come from `variant` and `size`, unless `contentColorClassName` (a `text-…` class) recolors the label and icon, as the lime "Add Set" on a `secondary` pill does. `<Button><Text>…</Text></Button>` is the older form; new code uses `label`.
- **`Card`** is a Liquid Glass surface. Never put a `bg-*` class on it: a background color on the native view turns the effect off (use `tintColor` for a tint). Pad its content with `CardHeader` / `CardContent`.
- **`Switch`** is a native SwiftUI `Toggle`, with its own haptic.
- **Icons** are SF Symbols: `systemImage` on `Button`, `sfSymbol` items in headers, `SymbolImage` (`components/symbol-image.tsx`) everywhere else. A symbol new to `SymbolImage` also gets its Lucide fallback in `LUCIDE_FALLBACKS`, or Android shows a question mark. Raster images use `expo-image` (`Image` from `~/components/tw`).
- **Forms** use `Input`, `Label` and `ErrorMessage`, inside the keyboard handling `react-native-keyboard-controller` already provides (`KeyboardProvider` in `components/providers.tsx`). See `components/forms/`.

## Every Screen has four states

Design all four, not just the happy path:

- **Loading**: the native `ActivityIndicator` with `colorClassName="accent-foreground"` in the space the content will fill, or a `Button` with `isLoading` for an action. Never a blank Screen.
- **Empty**: a centered `VStack` with a title, one line saying what's missing and one lime action that fixes it (the no-active-plan state in `app/(tabs)/home/index.tsx`).
- **Error**: say what failed in plain words and offer a retry. `ErrorMessage` for form fields. Never show a raw error string or a stack.
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

- Tap targets are at least 44×44 pt. The small icon `Button` sizes (`icon-sm` 36, `icon-xs` 32) only go inside a row that is itself the target; a small `Pressable` (a `SymbolImage` you tap) gets `hitSlop` up to 44 pt instead of a bigger visual.
- Every icon-only control has an `accessibilityLabel`. Headings come from `H1`–`H4`, so VoiceOver finds them.
- Information is never color alone: a failed or completed set says so in text or a symbol too.
- Reduced motion ships with the animation, not later: `useReducedMotion()` or `reduceMotion: ReduceMotion.System`. Fewer and gentler, not zero: keep the opacity change, drop the movement.

## Reference

Copy patterns from these:

- `components/views/workout-session-summary-view.tsx`: spacing tokens, stretched stacks, `Separator` between rows, a pill call to action with an SF Symbol.
- `components/views/workout-session-view.tsx`: a `Card` per exercise (each holds its own sets table, so they aren't rows of one list), a `pageSheet` picker. Its `backdropColor="#1F1D20"` should be `backdropColorClassName="accent-background"`.
- `app/(tabs)/home/index.tsx`: a native header with an SF Symbol menu, pull to refresh, the empty state. Its `ActivityIndicator color="#ffffff"` should be `colorClassName="accent-foreground"`, and its `<Text>` button child is the older form.
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

- `apps/web` uses shadcn-style Primitives in `components/ui/` (Tailwind v4, `cva`); add new ones with the shadcn CLI (`components.json`). It's on the shared tokens and dark only, like mobile, whatever the OS setting; Clerk's components get the tokens through `lib/clerk-appearance.ts`.
- `apps/site` (marketing) has its own `components/ui/`, is dark only on the shared tokens, and uses the lime `primary`. Hero and page headings use its `text-display-1` (36/40) and `text-display-2` (30/36); everything else is the HIG scale.
- The loop is the same: open the page with Playwright or Chrome DevTools, screenshot at 320 px and 1280 px wide (web and site with the OS in light mode too, to prove they stay dark), and have a fresh agent review the screenshots (see [Skills](#skills)). Screenshots cover layout only: touch, viewport height, input zoom and safe areas only show on a real phone, so list what needs that check in the pull request.
