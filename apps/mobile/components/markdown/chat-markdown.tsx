import * as WebBrowser from "expo-web-browser";
import { Linking, Text, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import Markdown from "./markdown";

const VAR_NAMES = [
  "--color-foreground",
  "--color-muted-foreground",
  "--color-border",
  "--color-secondary",
  "--color-muted",
  "--color-accent",
  // Tailwind blue
  "--color-blue-400",
] as const;

/**
 * Convert single newlines to hard breaks (two trailing spaces) so they render
 * the same way they appear during streaming. Skips fenced code blocks.
 */
function preserveNewlines(md: string): string {
  return md.replace(/(```[\s\S]*?```)|(\n)/g, (match, codeBlock) =>
    codeBlock ? match : "  \n"
  );
}

function openLink(url: string) {
  if (process.env.EXPO_OS === "web") {
    Linking.openURL(url);
  } else {
    WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
  }
}

export function ChatMarkdown({ children }: { children: string }) {
  const [, border, bg2, bg3, fill3, link] = useCSSVariable(
    VAR_NAMES as unknown as string[]
  ) as string[];

  const text = "white";

  // Type comes from the text styles: Callout for the message, titles for
  // headings, Mono for code
  const body = useResolveClassNames("text-callout");
  const bold = useResolveClassNames("text-callout-emphasized");
  const heading1 = useResolveClassNames("text-title-2-emphasized");
  const heading2 = useResolveClassNames("text-title-3-emphasized");
  const heading3 = useResolveClassNames("text-headline");
  const heading4 = useResolveClassNames("text-callout-emphasized");
  const heading5 = useResolveClassNames("text-subhead-emphasized");
  const heading6 = useResolveClassNames("text-footnote-emphasized");
  const code = useResolveClassNames("text-mono-footnote");
  const inlineCode = useResolveClassNames("text-mono-subhead");
  const bullet = useResolveClassNames("text-body");
  const tableCell = useResolveClassNames("text-subhead");

  // Only overrides — defaults from utils.ts are merged automatically
  const markdownStyles = {
    blockquote: {
      backgroundColor: bg3,
      borderColor: border,
      paddingHorizontal: 8,
    },
    codeContainer: { backgroundColor: fill3, borderRadius: 8, padding: 12 },
    codeText: {
      ...code,
      color: text,
    },
    heading1: { ...heading1, color: text },
    heading2: { ...heading2, color: text },
    heading3: { ...heading3, color: text },
    heading4: { ...heading4, color: text },
    heading5: { ...heading5, color: text },
    heading6: { ...heading6, color: text },
    image: {
      aspectRatio: 16 / 9,
      backgroundColor: fill3,
      borderRadius: 8,
      height: 200,
    },
    inlineCode: {
      backgroundColor: fill3,
      borderRadius: 4,
      ...inlineCode,
      color: text,
      overflow: "hidden" as const,
      paddingHorizontal: 4,
    },
    // Only the color: a link takes its type from the paragraph, heading or
    // emphasis around it
    link: { color: link },
    listBullet: {
      ...bullet,
      color: text,
      fontVariant: ["tabular-nums" as const],
      marginRight: 8,
    },
    paragraph: { ...body, marginVertical: 8 },
    strong: { fontFamily: bold.fontFamily, fontWeight: bold.fontWeight },
    table: { borderColor: border, borderRadius: 8 },
    tableCell: { borderRightColor: border, padding: 10 },
    tableCellText: { ...tableCell, color: text },
    tableHeaderCell: { backgroundColor: bg2 },
    tableHeaderCellText: { color: text },
    tableHeaderRow: { backgroundColor: bg2 },
    tableRow: { borderBottomColor: border },
    // Leaf text inherits the type of its paragraph, heading, emphasis or
    // table cell
    text: { color: text },
    thematicBreak: { backgroundColor: border },
  };

  return (
    <Markdown
      markdown={preserveNewlines(children)}
      onLinkPress={openLink}
      renderRules={{
        listItem: ({ node, styles, children: itemChildren, extras }) => (
          // biome-ignore lint/suspicious/noExplicitAny: StyleMap values are NamedStyle which requires cast for View/Text style props
          <View key={node.key} style={styles.listItem as any}>
            {extras?.customListStyleType ? (
              extras.customListStyleType
            ) : (
              <Text
                style={[
                  // biome-ignore lint/suspicious/noExplicitAny: StyleMap values are NamedStyle which requires cast for Text style prop
                  styles.listBullet as any,
                  extras?.ordered ? inlineCode : undefined,
                ]}
              >
                {extras?.listStyleType as string}
              </Text>
            )}
            {/* biome-ignore lint/suspicious/noExplicitAny: StyleMap values are NamedStyle which requires cast for View style prop */}
            <View style={styles.listItemContent as any}>{itemChildren}</View>
          </View>
        ),
      }}
      styles={markdownStyles}
    />
  );
}
