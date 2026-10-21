import * as WebBrowser from "expo-web-browser";
import { Linking, Text, View } from "react-native";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { Table, TableCell, TableHead, TableRow } from "~/components/ui/table";
import { Text as StyledText } from "~/components/ui/text";
import { cn } from "~/lib/utils";
import Markdown from "./markdown";

// Read in this order: text, rules, quiet fills (quotes, code, images), links
const VAR_NAMES = [
  "--color-foreground",
  "--color-border",
  "--color-muted",
  "--color-primary",
];

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
  const [text, border, muted, link] = useCSSVariable(VAR_NAMES) as string[];

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

  // Only overrides — defaults from utils.ts are merged automatically
  const markdownStyles = {
    blockquote: {
      backgroundColor: muted,
      borderColor: border,
      paddingHorizontal: 8,
    },
    codeContainer: { backgroundColor: muted, borderRadius: 8, padding: 12 },
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
      backgroundColor: muted,
      borderRadius: 8,
      height: 200,
    },
    inlineCode: {
      backgroundColor: muted,
      borderRadius: 4,
      ...inlineCode,
      color: text,
      overflow: "hidden" as const,
      paddingHorizontal: 4,
    },
    // Only the color: a link takes its type from the paragraph, heading or
    // emphasis around it. Lime, like every other accent in the app
    link: { color: link },
    listBullet: {
      ...bullet,
      color: text,
      fontVariant: ["tabular-nums" as const],
      marginRight: 8,
    },
    paragraph: { ...body, color: text, marginVertical: 8 },
    strong: { fontFamily: bold.fontFamily, fontWeight: bold.fontWeight },
    // Leaf text inherits its type and color from its paragraph, heading,
    // emphasis, link or table cell, so it sets neither: a color here would
    // paint over the link's
    text: {},
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
        // Tables are the Table Primitive, so they take its border and text
        // styles: a header row on `muted`, Subhead cells
        table: ({ node, children: rows }) => (
          <Table
            className="my-2 overflow-hidden rounded-lg border border-border border-continuous"
            key={node.key}
          >
            {rows}
          </Table>
        ),
        // Dividers go before a cell or row, never after the last one, so
        // they don't double the table's own border at the right and bottom
        tableCell: ({ node, children: content, extras }) => {
          const Cell = extras?.isHeader ? TableHead : TableCell;
          return (
            <Cell
              className={cn(
                "flex-1",
                (extras?.cellIndex ?? 0) > 0 && "border-border border-l"
              )}
              key={node.key}
            >
              <StyledText>{content}</StyledText>
            </Cell>
          );
        },
        tableRow: ({ node, children: cells, extras }) => (
          <TableRow
            className={
              extras?.isHeader ? "border-b-0 bg-muted" : "border-t border-b-0"
            }
            key={node.key}
          >
            {cells}
          </TableRow>
        ),
      }}
      styles={markdownStyles}
    />
  );
}
