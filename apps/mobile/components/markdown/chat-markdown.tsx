import * as WebBrowser from "expo-web-browser";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
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

  const isWeb = process.env.EXPO_OS === "web";
  const baseFontSize = isWeb ? 13 : 16;
  const baseLineHeight = isWeb ? 21.5 : 22;

  // Only overrides — defaults from utils.ts are merged automatically
  const markdownStyles = {
    blockquote: {
      backgroundColor: bg3,
      borderColor: border,
      paddingHorizontal: 8,
    },
    codeContainer: { backgroundColor: fill3, borderRadius: 8, padding: 12 },
    codeText: {
      color: text,
      fontFamily: Platform.select({
        default: "monospace",
        ios: "ui-monospace",
      }),
      fontSize: isWeb ? 12 : 14,
    },
    heading1: { color: text, fontSize: 24 },
    heading2: {
      color: text,
      fontSize: 20,
      fontWeight: "bold" as const,
      lineHeight: 28,
    },
    heading3: { color: text, fontSize: 18 },
    heading4: { color: text, fontSize: 16 },
    heading5: { color: text, fontSize: 14 },
    heading6: { color: text, fontSize: 12 },
    image: {
      aspectRatio: 16 / 9,
      backgroundColor: fill3,
      borderRadius: 8,
      height: 200,
    },
    inlineCode: {
      backgroundColor: fill3,
      borderRadius: 4,
      color: text,
      fontFamily: Platform.select({
        default: "monospace",
        ios: "ui-monospace",
      }),
      fontSize: isWeb ? 12 : 15,
      overflow: "hidden" as const,
      paddingHorizontal: 4,
    },
    link: { color: link, fontSize: baseFontSize },
    listBullet: {
      color: text,
      fontVariant: ["tabular-nums" as const],
      marginRight: 8,
    },
    paragraph: {
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
      marginVertical: 8,
    },
    table: { borderColor: border, borderRadius: 8 },
    tableCell: { borderRightColor: border, padding: 10 },
    tableCellText: { color: text },
    tableHeaderCell: { backgroundColor: bg2 },
    tableHeaderCellText: { color: text },
    tableHeaderRow: { backgroundColor: bg2 },
    tableRow: { borderBottomColor: border },
    text: { color: text, fontSize: baseFontSize, lineHeight: baseLineHeight },
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
                  extras?.ordered
                    ? fullStyles.orderedBullet
                    : fullStyles.unorderedBullet,
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

const fullStyles = StyleSheet.create({
  orderedBullet: {
    fontFamily: Platform.select({ default: "monospace", ios: "ui-monospace" }),
    fontWeight: "normal",
  },
  unorderedBullet: {
    fontSize: 18,
    fontWeight: "900",
  },
});
