import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { memo } from "react";

import ASTRenderer from "./ast-renderer";
import type { MarkdownProps } from "./types";
import { getKeyFromMarkdown, resolveReference } from "./utils";

const DEFAULT_EXTENSIONS: NonNullable<MarkdownProps["extensions"]> = [];

const Markdown = memo(
  ({
    markdown,
    debug,
    renderRules,
    listBulletStyle,
    styles,
    mergeStyle,
    customBulletElement,
    onLinkPress,
    extensions = DEFAULT_EXTENSIONS,
  }: MarkdownProps) => {
    const tree = fromMarkdown(markdown, {
      extensions: [gfmTable()],
      mdastExtensions: [
        gfmTableFromMarkdown(),
        resolveReference(),
        getKeyFromMarkdown(),
        ...extensions,
      ],
    });

    const renderer = new ASTRenderer({
      customBulletElement,
      debug,
      listBulletStyle,
      mergeStyle,
      onLinkPress,
      renderRules,
      styles,
    });

    return renderer.render(tree);
  }
);

Markdown.displayName = "Markdown";

export default Markdown;
