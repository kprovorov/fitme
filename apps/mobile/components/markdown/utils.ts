import type { Definition, Node, Root, RootContent } from "mdast";
import type { Extension } from "mdast-util-from-markdown";
import { Platform, StyleSheet } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

import type { StyleMap } from "./types";

// Layout only: colors come from the tokens, in the renderer's styles
// (`chat-markdown.tsx`)
const defaultStyles: StyleMap = {
  blockquote: {
    borderLeftWidth: 4,
    marginVertical: 8,
    paddingHorizontal: 5,
  },
  codeContainer: {
    borderRadius: 4,
    marginVertical: 4,
    padding: 8,
  },
  codeText: {
    ...Platform.select({
      android: {
        fontFamily: "monospace",
      },
      ios: {
        fontFamily: "ui-monospace",
      },
    }),
  },
  delete: {
    textDecorationLine: "line-through",
  },
  emphasis: {
    fontStyle: "italic",
  },
  heading1: {
    fontWeight: "bold",
  },
  heading2: {
    fontWeight: "600",
  },
  heading3: {
    fontWeight: "600",
  },
  heading4: {
    fontWeight: "600",
  },
  heading5: {
    fontWeight: "600",
  },
  heading6: {
    fontWeight: "600",
  },
  image: {
    aspectRatio: 1,
    height: 300,
    overflow: "hidden",
    resizeMode: "cover",
    width: "100%",
  },
  inlineCode: {
    ...Platform.select({
      android: {
        fontFamily: "monospace",
      },
      ios: {
        fontFamily: "ui-monospace",
      },
    }),
  },
  link: {
    textDecorationLine: "underline",
    transform: [{ translateY: 2 }],
  },
  list: {
    flex: 1,
  },
  listBullet: {
    fontWeight: "900",
  },
  listItem: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
  },
  listItemContent: {
    flex: 1,
    flexWrap: "wrap",
  },
  paragraph: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    marginVertical: 8,
    width: "100%",
  },
  root: {},
  strong: {
    fontWeight: "bold",
  },
  // Table styles
  table: {
    borderRadius: 4,
    borderWidth: 1,
    marginVertical: 8,
    overflow: "hidden",
  },
  tableCell: {
    borderRightWidth: 1,
    flex: 1,
    padding: 8,
  },
  tableCellText: {},
  tableHeaderCell: {},
  tableHeaderCellText: {
    fontWeight: "600",
  },
  tableHeaderRow: {},
  tableRow: {
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  text: {},
  thematicBreak: {
    flex: 1,
    height: 1,
    marginVertical: 8,
  },
};

// Remove text-only style props for View-safe styles
const removeTextStyleProps = (style: TextStyle): ViewStyle => {
  const result = { ...style };

  delete result.color;
  delete result.fontFamily;
  delete result.fontSize;
  delete result.fontStyle;
  delete result.fontWeight;
  delete result.letterSpacing;
  delete result.lineHeight;
  delete result.textAlign;
  delete result.textDecorationLine;
  delete result.textDecorationStyle;
  delete result.textDecorationColor;
  delete result.textShadowColor;
  delete result.textShadowOffset;
  delete result.textShadowRadius;
  delete result.textTransform;
  delete result.includeFontPadding;
  delete result.textAlignVertical;
  delete result.fontVariant;
  delete result.writingDirection;

  return result;
};

export const getMergedStyles = (
  styles: StyleMap | null = null,
  merge = false
): StyleMap => {
  const output: Record<string, ViewStyle | TextStyle | ImageStyle> = {};

  const allKeys = new Set([
    ...Object.keys(defaultStyles),
    ...(styles ? Object.keys(styles) : []),
  ]);

  for (const key of allKeys) {
    const base = StyleSheet.flatten(defaultStyles[key]) ?? {};
    const custom = StyleSheet.flatten(styles?.[key]) ?? {};

    let final = base;

    if (merge) {
      final = { ...base, ...custom };
    } else if (styles?.[key]) {
      final = custom;
    }

    output[key] = final;
    output[`_VIEW_SAFE_${key}`] = removeTextStyleProps(final);
  }

  return StyleSheet.create(output);
};

// Generate unique keys for nodes based on position
const getKey = (node: Node): string => {
  const { start, end } = node.position ?? {};

  if (start && end) {
    return `${node.type}-${start.line}:${start.column}-${end.line}:${end.column}`;
  }

  return `${node.type}-${Math.random().toString(16).slice(2, 8)}`;
};

const addKeysRecursively = (node: Root | RootContent): void => {
  if (node.position) {
    node.key = getKey(node);
  }

  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      addKeysRecursively(child);
    }
  }
};

export const getKeyFromMarkdown = (): Extension => ({
  transforms: [
    (tree) => {
      addKeysRecursively(tree);
    },
  ],
});

// Resolve link and image references
const normalizeIdentifier = (id: string): string => id.trim().toLowerCase();

const transform = (
  node: RootContent | Root,
  definitions: Map<string, Definition>
): void => {
  if (node.type === "linkReference" || node.type === "imageReference") {
    const def = definitions.get(normalizeIdentifier(node.identifier));

    if (!def) {
      return;
    }

    if (node.type === "linkReference") {
      Object.assign(node, {
        type: "link",
        url: def.url,
        title: def.title ?? null,
      });
    }

    if (node.type === "imageReference") {
      Object.assign(node, {
        type: "image",
        url: def.url,
        title: def.title ?? null,
      });
    }
  }

  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      transform(child, definitions);
    }
  }
};

export const resolveReference = (): Extension => ({
  transforms: [
    (tree) => {
      const definitions = new Map<string, Definition>();
      const definitionIndices: number[] = [];

      for (const node of tree.children) {
        if (node.type === "definition") {
          definitions.set(normalizeIdentifier(node.identifier), node);
          definitionIndices.push(tree.children.indexOf(node));
        }
      }

      if (definitions.size === 0) {
        return;
      }

      transform(tree, definitions);

      for (const index of definitionIndices.toReversed()) {
        tree.children.splice(index, 1);
      }
    },
  ],
});
