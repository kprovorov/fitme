import type { Node, Root } from "mdast";
import type { ReactElement, ReactNode } from "react";
import defaultRenderRules from "./render-rules";
import type {
  ASTRendererOptions,
  ListBulletStyle,
  NodeTypeMap,
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
      ...(renderRules || {}),
    };
    this._styles = getMergedStyles(styles, mergeStyle);
    this._listBulletStyle = listBulletStyle;
    this._debug = debug;
    this._onLinkPress = onLinkPress;
    this._customBulletElement = customBulletElement;
  }

  private get getListBulletCharacter(): string {
    switch (this._listBulletStyle) {
      case "disc":
        return "\u2022";
      case "dash":
        return "-";
      default:
        return "\u2022";
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
      return (this._renderRules.unknown ?? (() => null)) as RenderFunction;
    }
    return fn as RenderFunction;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST traversal naturally requires handling many node types
  private renderNode(
    node: Node,
    parentStack: Node[] = [],
    extras?: RenderExtras
  ): ReactNode {
    const children: ReactNode[] = [];
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
        const listNode = node as import("mdast").List;
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
        const tableNode = node as import("mdast").Table;
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
        const tableRowNode = node as import("mdast").TableRow;
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
        for (const child of node.children) {
          children.push(this.renderNode(child, [node, ...parentStack]));
        }
      }
    }

    const renderFunction = this.getRenderFunction(type);
    this.debugLog(parentStack.length, type);

    return renderFunction({
      children,
      extras: currentExtras,
      node: node as NodeTypeMap[typeof type],
      parentStack,
      styles: this._styles,
    });
  }

  readonly render = (tree: Root): ReactNode => this.renderNode(tree);
}
