import type { Node, Parent } from "mdast";
import type { Extension } from "mdast-util-from-markdown";
import {
  Platform,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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
type TextOnlyProps = Omit<TextStyle, keyof ViewStyle>;

function removeTextStyleProps<T extends ViewStyle | TextStyle>(
  style: T
): ViewStyle {
  const textOnlyKeys: (keyof TextOnlyProps)[] = [
    "color",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "textAlign",
    "textDecorationLine",
    "textDecorationStyle",
    "textDecorationColor",
    "textShadowColor",
    "textShadowOffset",
    "textShadowRadius",
    "textTransform",
    "includeFontPadding",
    "textAlignVertical",
    "fontVariant",
    "writingDirection",
  ];
  const result = { ...style };
  for (const key of textOnlyKeys) {
    delete (result as Record<string, unknown>)[key];
  }
  return result as ViewStyle;
}

export function getMergedStyles(
  styles: StyleMap | null = null,
  merge = false
): StyleMap {
  // biome-ignore lint/suspicious/noExplicitAny: StyleSheet.flatten returns any; style values are mixed RN style types
  const output: Record<string, any> = {};

  const allKeys = new Set([
    ...Object.keys(defaultStyles),
    ...(styles ? Object.keys(styles) : []),
  ]);

  for (const key of allKeys) {
    // biome-ignore lint/suspicious/noExplicitAny: StyleSheet.flatten input must be cast since defaultStyles values are opaque NamedStyle
    const base = StyleSheet.flatten(defaultStyles[key] as any) ?? {};
    // biome-ignore lint/suspicious/noExplicitAny: StyleSheet.flatten input must be cast since styles values are opaque NamedStyle
    const custom = StyleSheet.flatten(styles?.[key] as any) ?? {};

    const final = merge
      ? { ...base, ...custom }
      : styles?.[key]
        ? custom
        : base;

    output[key] = final;
    // biome-ignore lint/suspicious/noExplicitAny: removeTextStyleProps accepts merged style record which is dynamically typed
    output[`_VIEW_SAFE_${key}`] = removeTextStyleProps(final as any);
  }

  return StyleSheet.create(output);
}

// Generate unique keys for nodes based on position
function getKey(node: Node): string {
  const { start, end } = node.position ?? {};
  if (start && end) {
    return `${node.type}-${start.line}:${start.column}-${end.line}:${end.column}`;
  }
  return `${node.type}-${Math.random().toString(16).slice(2, 8)}`;
}

function addKeysRecursively(node: Node): void {
  if (node.position) {
    node.key = getKey(node);
  }
  if ("children" in node && Array.isArray((node as Parent).children)) {
    for (const child of (node as Parent).children) {
      addKeysRecursively(child);
    }
  }
}

export function getKeyFromMarkdown(): Extension {
  return {
    transforms: [
      (tree) => {
        addKeysRecursively(tree);
      },
    ],
  };
}

// Resolve link and image references
import type { Definition, Root, RootContent } from "mdast";

function normalizeIdentifier(id: string): string {
  return id.trim().toLowerCase();
}

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
      // biome-ignore lint/suspicious/noExplicitAny: mutating node type in-place to convert reference to resolved link
      const linkNode: any = node;
      linkNode.type = "link";
      linkNode.url = def.url;
      linkNode.title = def.title ?? null;
    }

    if (node.type === "imageReference") {
      // biome-ignore lint/suspicious/noExplicitAny: mutating node type in-place to convert reference to resolved image
      const imageNode: any = node;
      imageNode.type = "image";
      imageNode.url = def.url;
      imageNode.title = def.title ?? null;
    }
  }

  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      transform(child, definitions);
    }
  }
};

export function resolveReference(): Extension {
  return {
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

        for (const index of definitionIndices.reverse()) {
          tree.children.splice(index, 1);
        }
      },
    ],
  };
}
