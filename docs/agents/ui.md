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
2. Screenshot it (`xcrun simctl io booted screenshot /tmp/<name>.png`) and read the image. Fix what looks off, then take it again.
3. Check every state the Screen has (see [Every Screen has four states](#every-screen-has-four-states)), on the smallest and the largest supported iPhone, and once at the largest text size (`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`; reset with `large`).
4. Hand the screenshots and this file to a fresh reviewer agent and ask what looks wrong; for motion, hand it the code too, since a screenshot can't show it. Fix and repeat until it has nothing left but nitpicks. The builder is too generous grading its own work.
5. Put the final screenshots in the pull request description.

Screenshots prove layout, not feel. Motion, gestures and haptics are judged on a release build on a real iPhone (the simulator fires no haptics), so a pull request that adds any lists what still needs that check, for the maintainer to do.

The app is dark only (`userInterfaceStyle: "dark"` in `app.json`) and phone only (`supportsTablet: false`): don't spend time checking light mode or iPad. There are no light tokens.

## Platform

iOS first. Android renders but is second: SF Symbols draw nothing there (their box stays empty), glass falls back to blur. Prefer the native control to a custom one:

- Headers are native. The Screen's title is `Stack.Screen`'s `title`, never an `H1` at the top of the content. Options are `headerTransparent: true` and `headerBackButtonDisplayMode: "minimal"`, with actions as SF Symbol items or menus through `unstable_headerRightItems` (`app/(tabs)/home/index.tsx`) or `Stack.Toolbar` (`app/(tabs)/coach/chats.tsx`). No hand-built header rows.
- Content Screens scroll in a `ScrollView` with `contentInsetAdjustmentBehavior="automatic"`, so content sits under the transparent header and above the tab bar. Gutters and gaps go on `contentContainerClassName`, not `className`.
- List Screens (anything that maps rows of data) use `LegendList` from `@legendapp/list`, as the Coach conversation does, with the same `contentInsetAdjustmentBehavior` and a `refreshControl`. The `FlatList`s in history and the Coach's chat list are the older pattern.
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
| `destructive-foreground` | `#fafafa`   | Text on `destructive`                                                  |
| `border`                 | `#ffffff1a` | Separators and row dividers (`border-border`, often `border-hairline`) |
| `input`                  | `#ffffff26` | Field stroke (`Input`, `Textarea`)                                     |
| `ring`                   | `#737373`   | Focused field stroke (`Input`, `Textarea`)                             |

- In `className` use token names only (`text-muted-foreground`, `bg-background`). No hex, `rgb()` or `hsl()` in `className` or `style`.
- A color prop that isn't part of `style` on a React Native component gets its `…ClassName` prop with an `accent-` class: `<ActivityIndicator colorClassName="accent-foreground" />`, `tintColorClassName`, `backdropColorClassName="accent-background"`, `placeholderTextColorClassName` (`components/ui/input.tsx`). `className="text-…"` sets nothing there.
- Anything else that wants a color string (`@expo/ui` SwiftUI modifiers, a navigation theme, an SVG `fill`) gets a resolved token: `useSwiftUITheme()` from `components/ui/swift-ui.tsx`, or `useResolveClassNames("text-primary").color` from `uniwind`.
- Lime is the accent, not the paint. One lime action per Screen; everything else is `secondary` or `ghost`.
- A new color is a new Token in `@fitme/design-tokens` (see [Tokens](#tokens)), never a literal in an app.
- The literal `#C0FF38` and `#1F1D20` in `app/(tabs)/_layout.tsx`, `components/providers.tsx` and the workout session Screens are old debt. Don't copy them.

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
| Numbers in columns                     | `text-mono-footnote`, `text-mono-body-semibold` |                    | `Text` with the class                        |

- Text gets exactly one text style. No `font-*` weight or family class, `leading-*` or `tracking-*` next to it, and no `font-bold` to make a label heavier: pick the `-emphasized` style. Hierarchy within one role comes from Regular vs Emphasized and `text-muted-foreground`, not from another size.
- Headings come from `H1`–`H4`: they carry the style, the color and the heading role for VoiceOver. Don't rebuild one from `Text` and classes. `Text`'s `variant="h1"` gives the same style and role, but `Text` also takes the text style of the Primitive it sits in (`TextClassContext`), which a heading shouldn't, so use `H1`–`H4`.
- A Primitive that holds text (`Badge`, `TableHead`, `TableCell`, `AvatarFallback`, `AccordionTrigger`) hands its style and color to the `Text` inside it: write `<Badge><Text>3</Text></Badge>`, with no text classes on the `Text`.
- Never use an arbitrary size or leading (`text-[13px]` is `text-footnote`, `[15px]` is `text-subhead`, `[17px]` is `text-body`), Tailwind's default scale (`text-sm`, `text-lg`) or an inline `fontSize`. Where a native prop wants a font (SwiftUI's `font` modifier, a header's `headerLargeTitleStyle`, markdown styles), resolve a style: `useSwiftUIFont("text-body-emphasized")` from `components/ui/swift-ui.tsx`, or `useResolveClassNames("text-title-1-emphasized")` from `uniwind`.
- Merge classes with `cn()` from `~/lib/utils`, never `clsx` or `twMerge` directly: it knows the text styles, so a later style replaces an earlier one (and any font, weight, size, leading or tracking class) and keeps the text color.
- Write class names out in full. uniwind only sees literal classes, so `` `text-${color}` `` silently styles nothing: pick from a map or a ternary of full names.
- Changing a text style means editing `tokens.css` (the `--text-*` sizes or the `@utility` blocks) and the matching Figma text style in the same PR.

## Size

Button heights, measured from the native SwiftUI buttons on iOS 27 with our labels (Liquid Glass and the solid fallback styles draw the same box), rounded to whole points. A circle's diameter is its own size: it holds a glyph, which is shorter than a label. The native Button sizes itself; the tokens are for what can't (a `ghost` Button, which takes them so it lines up with its siblings) and for web and Figma (`Size/button-pill-default`) to copy.

| Token                          | Value | `Button`                            | Measured (pt) |
| ------------------------------ | ----- | ----------------------------------- | ------------- |
| `--size-button-pill-sm`        | 31px  | `size="sm"` (`controlSize(.small)`) | 30.67         |
| `--size-button-pill-default`   | 53px  | `size="default"` (`.large`)         | 53.33         |
| `--size-button-pill-lg`        | 57px  | `size="lg"` (`.extraLarge`)         | 57.33         |
| `--size-button-circle-sm`      | 25px  | `shape="circle" size="sm"`          | 25.00         |
| `--size-button-circle-default` | 47px  | `shape="circle"`                    | 46.67         |
| `--size-button-circle-lg`      | 50px  | `shape="circle" size="lg"`          | 49.67         |

On iOS 27 `.large` and `.extraLarge` draw the same padding, so `lg` is taller only by its Title 3 label. Re-measure when the label fonts, the control sizes or the iOS version change: render each size in a throwaway `__DEV__` screen, log the `onLayout` height of a `View` around each Button, then update `tokens.css`, the Figma `Size` variables and this table together.

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

- **`Button`** (`components/ui/button.tsx`, the Figma `Button` set) is a native SwiftUI button; web and site use the same variants, sizes, shapes and icon positions with solid fills:
  - `variant`: `default` (lime, prominent glass), `destructive` (prominent glass tinted `destructive`), `secondary` (regular glass) or `ghost` (plain, no fill). Without Liquid Glass (before iOS 26) the same mapping uses the solid native styles (`borderedProminent`, `bordered`).
  - `size`: `sm`, `default` or `lg`, at the native heights in [Size](#size). The label is the size's Emphasized text style: `text-subhead-emphasized`, `text-body-emphasized`, `text-title-3-emphasized`.
  - `shape`: `pill` (default) or `circle`. A circle takes `icon` and `accessibilityLabel` (both required, the types enforce it) and shows no label. Native circles need iOS 17 (`buttonBorderShape(.circle)`); below it the Button paints its own circle at the `--size-button-circle-*` diameter (`NATIVE_CIRCLE_ENABLED` in `components/ui/swift-ui.tsx`).
  - `icon` (an SF Symbol name) and `iconPosition` (`leading`, the default, or `trailing`; the forward `arrow.right` trails).
  - A pill needs `label` (a string), or `children`: the older form, kept for views that aren't SF Symbols (the support page's brand logos, each in a 44 pt-wide view so it's a full tap target). A lone icon is a circle. Use `isLoading` while its action runs; the button keeps its size. It spans its container's width unless it's a circle or `ghost` (or you pass `fill`). `className` only lays it out; the label's font and color come from `variant` and `size`, unless `contentColorClassName` (a `text-…` class) recolors the label and icon, as the lime "Add Set" on a `secondary` pill does.
  - **Web and site:** `default`, `secondary` and `destructive` have the matching solid token fill and `*-foreground` text; `ghost` is transparent with `foreground` text and `muted` on hover. No glass, blur or translucent fills. All use `rounded-full`, and sizes select the same Emphasized styles above. Pill heights use `h-(--size-button-pill-sm/default/lg)` (each suffix is written out in code); circles use `size-(--size-button-circle-sm/default/lg)` for both dimensions. These are Tailwind v4 CSS-variable references, not new arbitrary measurements. `className` is for layout (`w-full`, `mt-*`, `self-*`), never for overriding geometry, fill or text style. Both Buttons merge caller classes first (`cn(className, buttonVariants(...))`), so the Primitive owns those styles. With `asChild`, the composed child must have no `className` either: Radix Slot appends it without merging, so put layout classes on Button. To check the rule cheaply, grep the two Button implementations for this merge order.
  - Web/site pill text is `children`; `icon` accepts an SVG component or a React element, so Lucide can be replaced with Tabler without changing Button. Icons are decorative (`aria-hidden`), inherit the label color, and `iconPosition` defaults to `leading`. A circle requires `icon` and `aria-label`, forbids `children` and `iconPosition`, and uses a native `<button>`; the types enforce this. Both apps support `asChild` for pill links, including an icon beside the link's content; it requires a single React element, rejects `disabled`, and the rendered anchor keeps normal link keyboard behavior. Use Button composition to style links; `buttonVariants` is private. Native buttons default to `type="button"`, accept normal DOM props, and show a `ring` focus ring with a background-colored offset on keyboard focus. Removed shadcn values (`outline`, `link`, `icon`, `icon-sm`, `icon-xs`) are rejected by each app's `button.typecheck.tsx` cases. Use `ghost` or a plain link instead of `link`.
- **`Card`** is a flat `card` surface with the `card` radius (16) and `sm` padding (16), with no glass, border or shadow. `variant` is `default` or `ghost` (transparent, same radius and padding, for grouped content that shouldn't read as a surface), and it's the only styling prop Card needs: `className` only lays out its children (`gap-sm`, `flex-1`), never sets a background, radius or padding. Card already pads its content, so `CardHeader` / `CardContent` add none. Rows that run edge to edge (a settings list, History's months) go in `MenuList`, which has Card's fill and radius but no padding, divided by `Separator`.
- **`Badge`** is a small `rounded-full` pill: `variant` is `default` (lime, `primary`), `secondary`, `destructive` or `muted`, each a token fill and its foreground. Like `Card`, it owns its look: `className` only places it, a caller's fill, radius, padding or gap is dropped.
- **`Separator`** is a one-point `border` line; `orientation="vertical"` for a column. **`Avatar`**'s fallback is a `muted` circle with Headline text in `muted-foreground`.
- **`Table`** (`TableHeader`, `TableRow`, `TableHead`, `TableCell`, …) divides rows with `border`, puts the header and footer on `muted` and sets cells in Subhead. The Coach's markdown tables render with it (`components/markdown/chat-markdown.tsx`). **`Accordion`** has a Body Emphasized trigger with an SF Symbol `chevron.down`. Neither has another call site yet.
- **`Switch`** is a native SwiftUI `Toggle`, with its own haptic.
- **Icons** are SF Symbols, and only SF Symbols (no icon library): `icon` on `Button`, `sfSymbol` items in headers, `SymbolImage` (`components/symbol-image.tsx`) everywhere else. Give `SymbolImage` the text style and color of the text it sits next to (`className="text-footnote text-muted-foreground"`): the symbol takes the style's point size and weight, and the color token as its tint. `size` is only for a symbol that stands alone (an empty state's illustration). Names are typed (`SFSymbol`), and the app targets iOS 16.4, so check a new symbol's availability (SF Symbols app) before using it. Brand art isn't a symbol: keep it as an asset or SVG. Raster images use `expo-image` (`Image` from `~/components/tw`).
- **Forms** use `Input`, `Textarea`, `Label` and `ErrorMessage`, inside the keyboard handling `react-native-keyboard-controller` already provides (`KeyboardProvider` in `components/providers.tsx`). See `components/forms/`.
  - `Input` (at least 48 pt) and `Textarea` (at least 80 pt, text from the top), both growing with large text, are the same field: a transparent fill with an `input` stroke, `rounded-lg`, `sm` side padding and `text-body` in `foreground`, so it reads the same on `background` and on a `card`. The stroke is `ring` while focused and `destructive` with an error (which wins over focus); a field that isn't `editable`, or is `readOnly`, is dimmed. The placeholder is `muted-foreground` (`placeholderTextColorClassName`) and the caret `primary` (`selectionColorClassName`).
  - An `Input`'s or `Textarea`'s error goes in its `error` prop, never in an `ErrorMessage` next to it: a string shows under the field in `destructive` and VoiceOver reads it as the field's hint; `true` only turns the stroke `destructive`, for a form that shows the message elsewhere (a set row's errors go under the row). With react-hook-form, pass `fieldState.error?.message` from the `Controller`'s render.
  - `className` styles the field (`min-h-10 text-center text-mono-subhead` for a set cell); `containerClassName` lays out the field and its message together (`flex-1` in a row).
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

- Tap targets are at least 44×44 pt. A circle `Button` is `size="default"` (47 pt) unless it sits inside a row that is itself the target; `sm` (25 pt) and `sm` pills (31 pt) are for those rows and dense toolbars. A small `Pressable` (a `SymbolImage` you tap) gets `hitSlop` up to 44 pt instead of a bigger visual.
- Every icon-only control has an `accessibilityLabel` (a circle `Button` won't type-check without one). Headings come from `H1`–`H4`, so VoiceOver finds them.
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

- `apps/web` uses shadcn-style Primitives in `components/ui/` (Tailwind v4, `cva`); add new ones with the shadcn CLI (`components.json`). It's on the shared tokens and dark only, like mobile, whatever the OS setting; Clerk's components get the tokens through `lib/clerk-appearance.ts`. Its `cn()` knows the text styles; the dashboard is set in them, while the rest of web (its `components/ui/` Primitives included) still uses Tailwind's default sizes until those move.
- `apps/site` (marketing) has its own `components/ui/`, is dark only on the shared tokens, and uses the lime `primary`. Hero and page headings use its `text-display-1` (36/40) and `text-display-2` (30/36): plain font sizes outside the HIG set, so they are the one place `font-bold` and `tracking-tight` still sit next to a size. Everything else is the HIG text styles, as on mobile.
- The loop is the same: open the page with Playwright or Chrome DevTools, screenshot at 320 px and 1280 px wide (web and site with the OS in light mode too, to prove they stay dark), and have a fresh agent review the screenshots (see [Skills](#skills)). Screenshots cover layout only: touch, viewport height, input zoom and safe areas only show on a real phone, so list what needs that check in the pull request.
