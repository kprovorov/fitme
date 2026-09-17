import {
  Image,
  type ImageProps,
  type ImageStyle,
  Linking,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { CodeBlock } from "./code-block";
import type { RenderRules, StyleMap } from "./types";

// Helper to safely get styles with proper casting
const getViewStyle = (styles: StyleMap, key: string): ViewStyle | undefined =>
  styles[key] as ViewStyle | undefined;
const getTextStyle = (styles: StyleMap, key: string): TextStyle | undefined =>
  styles[key] as TextStyle | undefined;

const renderRules: RenderRules = {
  blockquote: ({ node, styles, children }) => (
    <View key={node.key} style={getViewStyle(styles, "_VIEW_SAFE_blockquote")}>
      {children}
    </View>
  ),
  break: ({ node, styles }) => (
    <Text key={node.key} style={getTextStyle(styles, "text")}>
      {"\n"}
    </Text>
  ),
  code: ({ node }) => (
    <CodeBlock
      code={node.value}
      key={node.key}
      language={node.lang || undefined}
    />
  ),
  delete: ({ node, styles, children }) => (
    <Text key={node.key} style={getTextStyle(styles, "delete")}>
      {children}
    </Text>
  ),
  emphasis: ({ node, styles, children }) => (
    <Text key={node.key} style={getTextStyle(styles, "emphasis")}>
      {children}
    </Text>
  ),
  heading: ({ node, styles, children }) => (
    <Text key={node.key} style={getTextStyle(styles, `heading${node.depth}`)}>
      {children}
    </Text>
  ),
  image: ({ node, styles }) => {
    const imageProps: ImageProps = {
      source: { uri: node.url },
      style: styles.image as ImageStyle,
    };
    if (node.alt) {
      imageProps.accessibilityLabel = node.alt;
      imageProps.alt = node.alt;
      imageProps.accessible = true;
    }
    return <Image key={node.key} {...imageProps} />;
  },
  inlineCode: ({ node, styles }) => (
    <Text key={node.key} style={getTextStyle(styles, node.type)}>
      {node.value}
    </Text>
  ),
  link: ({ node, styles, children, extras }) => {
    const onPress = () =>
      extras?.onPress(node.url) || (() => Linking.openURL(node.url));
    return (
      <Text
        key={node.key}
        onPress={onPress}
        style={getTextStyle(styles, "link")}
      >
        {children}
      </Text>
    );
  },
  list: ({ node, styles, children }) => (
    <View
      key={node.key}
      style={getViewStyle(styles, `_VIEW_SAFE_${node.type}`)}
    >
      {children}
    </View>
  ),
  listItem: ({ node, styles, children, extras }) => (
    <View key={node.key} style={getViewStyle(styles, "listItem")}>
      {extras?.customListStyleType ? (
        extras.customListStyleType
      ) : (
        <Text style={getTextStyle(styles, "listBullet")}>
          {extras?.listStyleType}
        </Text>
      )}
      <View style={getViewStyle(styles, "listItemContent")}>{children}</View>
    </View>
  ),
  paragraph: ({ node, styles, children, parentStack }) => {
    const inListItem = parentStack.some((p) => p.type === "listItem");
    return (
      <Text
        key={node.key}
        style={[
          getTextStyle(styles, "paragraph"),
          inListItem && { marginVertical: 0 },
        ]}
      >
        {children}
      </Text>
    );
  },
  root: ({ node, styles, children }) => (
    <View key={node.key} style={getViewStyle(styles, "_VIEW_SAFE_root")}>
      {children}
    </View>
  ),
  strong: ({ node, styles, children }) => (
    <Text key={node.key} style={getTextStyle(styles, "strong")}>
      {children}
    </Text>
  ),
  table: ({ node, styles, children }) => (
    <View key={node.key} style={getViewStyle(styles, "_VIEW_SAFE_table")}>
      {children}
    </View>
  ),
  tableCell: ({ node, styles, children, extras }) => (
    <View
      key={node.key}
      style={[
        getViewStyle(styles, "_VIEW_SAFE_tableCell"),
        extras?.isHeader && getViewStyle(styles, "_VIEW_SAFE_tableHeaderCell"),
      ]}
    >
      <Text
        style={[
          getTextStyle(styles, "tableCellText"),
          extras?.isHeader && getTextStyle(styles, "tableHeaderCellText"),
        ]}
      >
        {children}
      </Text>
    </View>
  ),
  tableRow: ({ node, styles, children, extras }) => (
    <View
      key={node.key}
      style={[
        getViewStyle(styles, "_VIEW_SAFE_tableRow"),
        extras?.isHeader && getViewStyle(styles, "_VIEW_SAFE_tableHeaderRow"),
      ]}
    >
      {children}
    </View>
  ),
  text: ({ node, styles }) => (
    <Text
      key={node.key}
      maxFontSizeMultiplier={1.2}
      style={getTextStyle(styles, "text")}
    >
      {node.value}
    </Text>
  ),
  thematicBreak: ({ node, styles }) => (
    <View
      key={node.key}
      style={getViewStyle(styles, `_VIEW_SAFE_${node.type}`)}
    />
  ),
  unknown: ({ node }) => {
    console.warn("Unknown node type encountered", node.type);
    return null;
  },
};

export default renderRules;
