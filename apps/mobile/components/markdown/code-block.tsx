import transform, { type StyleTuple } from "css-to-react-native";
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useColorScheme,
  View,
} from "react-native";
import SyntaxHighlighter from "react-syntax-highlighter";
import {
  githubGist,
  irBlack,
} from "react-syntax-highlighter/dist/esm/styles/hljs";

interface HighlighterStyleSheet {
  [key: string]: TextStyle;
}
interface ReactStyle {
  [key: string]: CSSProperties;
}

interface RendererNode {
  children?: RendererNode[];
  properties?: {
    className?: string[];
  };
  tagName?: string;
  value?: string;
}

const ALLOWED_STYLE_PROPERTIES: Record<string, boolean> = {
  background: true,
  backgroundColor: true,
  color: true,
  fontStyle: true,
  fontWeight: true,
};

const cleanStyle = (style: CSSProperties) => {
  const styles = Object.entries(style)
    .filter(([key]) => ALLOWED_STYLE_PROPERTIES[key])
    .map<StyleTuple>(([key, value]) => [key, String(value)]);
  return transform(styles);
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

function trimNewlines(string: string): string {
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
}

// Pre-compute stylesheets for both themes
const darkStylesheet = getRNStylesFromHljsStyle(irBlack as ReactStyle);
const lightStylesheet = getRNStylesFromHljsStyle(githubGist as ReactStyle);

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlockBase({ code, language }: CodeBlockProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const stylesheet = isDark ? darkStylesheet : lightStylesheet;

  const baseStyle = useMemo(
    () =>
      StyleSheet.flatten([
        styles.text,
        { color: stylesheet.hljs?.color || (isDark ? "#f8f8f2" : "#333") },
      ]),
    [stylesheet, isDark]
  );

  const containerStyle = useMemo(
    () => [
      styles.container,
      { backgroundColor: isDark ? "#1a1a1a" : "#f6f8fa" },
    ],
    [isDark]
  );

  const getStylesForNode = useCallback(
    (node: RendererNode): TextStyle[] => {
      const classes: string[] = node.properties?.className ?? [];
      return classes
        .map((c: string) => stylesheet[c])
        .filter((c) => !!c) as TextStyle[];
    },
    [stylesheet]
  );

  const renderNodeChildren = useCallback(
    (nodes: RendererNode[], keyPrefix = "row"): ReactNode[] =>
      nodes.reduce<ReactNode[]>((acc, node, index) => {
        const keyPrefixWithIndex = `${keyPrefix}_${index}`;
        if (node.children) {
          const nodeStyles = getStylesForNode(node);
          const textStyles = nodeStyles.length > 0 ? nodeStyles : undefined;
          acc.push(
            <Text key={keyPrefixWithIndex} style={textStyles}>
              {renderNodeChildren(node.children, `${keyPrefixWithIndex}_child`)}
            </Text>
          );
        }
        if (node.value) {
          acc.push(trimNewlines(String(node.value)));
        }
        return acc;
      }, []),
    [getStylesForNode]
  );

  const renderer = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: react-syntax-highlighter renderer props have no exported type
    (props: any) => {
      const { rows } = props;
      return (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <View style={styles.codeContent}>
            {rows.map((row: RendererNode, index: number) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: syntax rows have no stable identity
              <Text key={`row_${index}`} style={baseStyle}>
                {renderNodeChildren(row.children || [], `row_${index}`)}
              </Text>
            ))}
          </View>
        </ScrollView>
      );
    },
    [renderNodeChildren, baseStyle]
  );

  return (
    <View style={containerStyle}>
      <SyntaxHighlighter
        // biome-ignore lint/suspicious/noExplicitAny: react-syntax-highlighter CodeTag/PreTag props expect ComponentType<any>
        CodeTag={View as any}
        customStyle={{ backgroundColor: "transparent" }}
        language={language || "typescript"}
        // biome-ignore lint/suspicious/noExplicitAny: react-syntax-highlighter CodeTag/PreTag props expect ComponentType<any>
        PreTag={View as any}
        renderer={renderer}
        style={undefined}
      >
        {code}
      </SyntaxHighlighter>
    </View>
  );
}

export const CodeBlock = memo(CodeBlockBase);

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
  text: {
    fontFamily: Platform.select({ default: "monospace", ios: "monospace-ui" }),
    fontSize: 14,
    lineHeight: 20,
  },
});
