import transform from "css-to-react-native";
import type { StyleTuple } from "css-to-react-native";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { TextStyle } from "react-native";
import SyntaxHighlighter from "react-syntax-highlighter";
import { irBlack } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useCSSVariable } from "uniwind";

type HighlighterStyleSheet = Record<string, TextStyle | undefined>;

type ReactStyle = Record<string, CSSProperties>;

interface RendererNode {
  children?: RendererNode[];
  properties?: {
    className?: string[];
  };
  value?: string | number;
}

const ALLOWED_STYLE_PROPERTIES = new Set([
  "background",
  "backgroundColor",
  "color",
  "fontStyle",
  "fontWeight",
]);

const cleanStyle = (style: CSSProperties) => {
  const declarations: StyleTuple[] = [];

  for (const [key, value] of Object.entries(style)) {
    if (ALLOWED_STYLE_PROPERTIES.has(key)) {
      declarations.push([key, String(value)]);
    }
  }

  return transform(declarations);
};

const getRNStylesFromHljsStyle = (
  hljsStyle: ReactStyle
): HighlighterStyleSheet =>
  Object.fromEntries(
    Object.entries(hljsStyle).map(([className, style]) => [
      className,
      cleanStyle(style),
    ])
  );

const trimNewlines = (string: string): string => {
  let start = 0;
  let end = string.length;

  while (start < end && (string[start] === "\r" || string[start] === "\n")) {
    start += 1;
  }

  while (
    end > start &&
    (string[end - 1] === "\r" || string[end - 1] === "\n")
  ) {
    end -= 1;
  }

  return start > 0 || end < string.length ? string.slice(start, end) : string;
};

// Pre-computed once: the app is dark only, so there is one theme
const stylesheet = getRNStylesFromHljsStyle(irBlack);

const styles = StyleSheet.create({
  codeContent: {
    padding: 12,
  },
  container: {
    borderRadius: 8,
    marginVertical: 4,
    overflow: "hidden",
  },
  scrollContent: {
    minWidth: "100%",
  },
});

const getStylesForNode = (node: RendererNode): TextStyle[] => {
  const nodeStyles: TextStyle[] = [];

  for (const className of node.properties?.className ?? []) {
    const style = stylesheet[className];

    if (style) {
      nodeStyles.push(style);
    }
  }

  return nodeStyles;
};

const keyedNodes = (nodes: RendererNode[]) => {
  const occurrences = new Map<string, number>();

  return nodes.map((node) => {
    const content = JSON.stringify(node);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);

    return { key: `${content}_${occurrence}`, node };
  });
};

const renderNodeChildren = (nodes: RendererNode[]): ReactNode[] => {
  const children: ReactNode[] = [];

  for (const { key, node } of keyedNodes(nodes)) {
    if (node.children) {
      const nodeStyles = getStylesForNode(node);
      const textStyles = nodeStyles.length > 0 ? nodeStyles : undefined;
      children.push(
        <Text key={key} style={textStyles}>
          {renderNodeChildren(node.children)}
        </Text>
      );
    }

    if (node.value) {
      children.push(trimNewlines(String(node.value)));
    }
  }

  return children;
};

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlockBase = ({ code, language }: CodeBlockProps) => {
  // SAFETY: --color-foreground is defined as a CSS color string in tokens.css.
  const foreground = useCSSVariable("--color-foreground") as string;
  // SAFETY: --color-muted is defined as a CSS color string in tokens.css.
  const surface = useCSSVariable("--color-muted") as string;

  const baseStyle = useMemo(
    () => ({ color: stylesheet.hljs?.color || foreground }),
    [foreground]
  );

  const containerStyle = useMemo(
    () => [styles.container, { backgroundColor: surface }],
    [surface]
  );

  const renderer = useCallback(
    ({ rows }: { rows: RendererNode[] }) => (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.codeContent}>
          {keyedNodes(rows).map(({ key, node: row }) => (
            <Text className="text-mono-footnote" key={key} style={baseStyle}>
              {renderNodeChildren(row.children || [])}
            </Text>
          ))}
        </View>
      </ScrollView>
    ),
    [baseStyle]
  );

  return (
    <View style={containerStyle}>
      <SyntaxHighlighter
        CodeTag={View}
        customStyle={{ backgroundColor: "transparent" }}
        language={language || "typescript"}
        PreTag={View}
        renderer={renderer}
        style={undefined}
      >
        {code}
      </SyntaxHighlighter>
    </View>
  );
};

export const CodeBlock = memo(CodeBlockBase);
