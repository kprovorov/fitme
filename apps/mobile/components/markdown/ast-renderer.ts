import type { List, Node, Root, Table, TableRow } from "mdast";
import type { ReactElement, ReactNode } from "react";

import defaultRenderRules from "./render-rules";
import type {
  ASTRendererOptions,
  ListBulletStyle,
  RenderExtras,
  RenderFunction,
  RenderRules,
  StyleMap,
  ValidNodeKey,
} from "./types";
import { getMergedStyles } from "./utils";

export default class ASTRenderer {
  private readonly _renderRules: RenderRules;
  private readonly _styles: StyleMap;
  private readonly _debug: boolean;
  private readonly _listBulletStyle: ListBulletStyle;
  private readonly _customBulletElement: ReactElement | null;
  private readonly _onLinkPress?: (url: string) => void;

  constructor({
    renderRules,
    styles = null,
    mergeStyle = true,
    debug = false,
    listBulletStyle = "disc",
    customBulletElement = null,
    onLinkPress,
  }: ASTRendererOptions) {
    this._renderRules = {
      ...defaultRenderRules,
      ...renderRules,
    };
    this._styles = getMergedStyles(styles, mergeStyle);
    this._listBulletStyle = listBulletStyle;
    this._debug = debug;
    this._onLinkPress = onLinkPress;
    this._customBulletElement = customBulletElement;
  }

  private get getListBulletCharacter(): string {
    switch (this._listBulletStyle) {
      case "disc": {
        return "\u2022";
      }

      case "dash": {
        return "-";
      }

      default: {
        return "\u2022";
      }
    }
  }

  private debugLog(length: number, type: string) {
    if (this._debug) {
      console.log(`${" ".repeat(length)}${type}`);
    }
  }

  private getRenderFunction(type: keyof RenderRules): RenderFunction {
    const fn = this._renderRules[type];

    if (!fn) {
      console.warn(`Missing render rule for node type: ${type}`);

      const { unknown } = this._renderRules;

      return unknown ? (params) => unknown(params) : () => null;
    }

    // SAFETY: The rule is selected by node.type and called with that same node below.
    return fn as RenderFunction;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal naturally requires handling many node types
  private renderNode(
    node: Node,
    parentStack: Node[] = [],
    extras?: RenderExtras
  ): ReactNode {
    const children: ReactNode[] = [];
    // SAFETY: mdast types are renderer keys; unrecognized types use the unknown rule.
    const type = node.type as ValidNodeKey;

    let currentExtras = extras;

    if (type === "link" && this._onLinkPress) {
      currentExtras = {
        ...currentExtras,
        onPress: this._onLinkPress,
      };
    }

    if ("children" in node && Array.isArray(node.children)) {
      if (type === "list") {
        // SAFETY: node.type is "list" and its children were checked above.
        const listNode = node as List;
        const start = listNode.start ?? 1;
        const ordered = listNode.ordered ?? false;

        for (let i = 0; i < listNode.children.length; i += 1) {
          const listItemNode = listNode.children[i];

          const listStyleType = ordered
            ? `${start + i}.`
            : this.getListBulletCharacter;

          const customListStyleType = !ordered && this._customBulletElement;

          if (!listItemNode) {
            console.warn(`Skipping empty list item at index: ${i}`);
            continue;
          }

          const renderedChild = this.renderNode(
            listItemNode,
            [node, ...parentStack],
            { customListStyleType, index: i, listStyleType, ordered, start }
          );

          children.push(renderedChild);
        }
      } else if (type === "table") {
        // Handle table with header row detection
        // SAFETY: node.type is "table" and its children were checked above.
        const tableNode = node as Table;

        for (let i = 0; i < tableNode.children.length; i += 1) {
          const rowNode = tableNode.children[i];

          if (rowNode) {
            children.push(
              this.renderNode(rowNode, [node, ...parentStack], {
                isHeader: i === 0,
                rowIndex: i,
              })
            );
          }
        }
      } else if (type === "tableRow") {
        // Handle table row with cell rendering
        // SAFETY: node.type is "tableRow" and its children were checked above.
        const tableRowNode = node as TableRow;

        for (let i = 0; i < tableRowNode.children.length; i += 1) {
          const cellNode = tableRowNode.children[i];

          if (cellNode) {
            children.push(
              this.renderNode(cellNode, [node, ...parentStack], {
                ...currentExtras,
                cellIndex: i,
              })
            );
          }
        }
      } else {
        // SAFETY: mdast parents contain Nodes; the children array was checked above.
        for (const child of node.children as Node[]) {
          children.push(this.renderNode(child, [node, ...parentStack]));
        }
      }
    }

    const renderFunction = this.getRenderFunction(type);
    this.debugLog(parentStack.length, type);

    return renderFunction({
      children,
      extras: currentExtras,
      node,
      parentStack,
      styles: this._styles,
    });
  }

  readonly render = (tree: Root): ReactNode => this.renderNode(tree);
}
