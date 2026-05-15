import type { Node, Root, RootContentMap } from "mdast";
import type { Extension } from "mdast-util-from-markdown";
import type { ReactElement } from "react";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";

// Style types
type NamedStyle = StyleProp<ViewStyle | TextStyle | ImageStyle>;
export type StyleMap = Record<string, NamedStyle>;

// Utility types
type ExpandUnion<T> = T extends infer U ? U : never;
type Prettify<T> = { [K in keyof T]: T[K] } & {};

// Node types
type BaseNodeKeys = {
  [K in keyof RootContentMap]: RootContentMap[K] extends Node ? K : never;
}[keyof RootContentMap];

export type ValidNodeKey = ExpandUnion<BaseNodeKeys | "unknown" | "root">;

export type NodeTypeMap = Prettify<
  {
    [K in BaseNodeKeys]: RootContentMap[K];
  } & {
    unknown: Node;
    root: Root;
  }
>;

// Render function types
export type RenderFunction<K extends ValidNodeKey = ValidNodeKey> = (params: {
  node: NodeTypeMap[K];
  styles: StyleMap;
  children: any[];
  parentStack: Node[];
  extras?: any;
}) => any;

export type RenderRules = {
  [K in ValidNodeKey]?: RenderFunction<K>;
};

export type ListBulletStyle = "disc" | "dash";

export interface ASTRendererOptions {
  customBulletElement?: ReactElement | null;
  debug?: boolean;
  listBulletStyle?: ListBulletStyle;
  mergeStyle?: boolean;
  onLinkPress?: (url: string) => void;
  renderRules?: RenderRules;
  styles?: StyleMap | null;
}

export interface MarkdownProps extends ASTRendererOptions {
  extensions?: Extension[];
  markdown: Uint8Array | string;
}

// Extend mdast Node to include key property
declare module "mdast" {
  interface Node {
    key?: string;
  }
}
