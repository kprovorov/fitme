/**
 * What VoiceOver reads for an accessible element without a label of its own,
 * worked out from the rendered host tree the way React Native composes it on
 * iOS (`RCTRecursiveAccessibilityLabel`): each child's own label, else its
 * children's, joined with ", ", skipping a child whose
 * `accessibilityElementsHidden` is set. Text reads as itself, and an SF Symbol
 * image without a label reads as its symbol's name, since UIKit gives a
 * symbol image one ("chevron.right" is "Forward"), which is what a decorative
 * symbol has to keep out of the row's label. A Text reads as its text, and a
 * View nested in it as U+FFFC, the object replacement character, with nothing
 * of what's inside it: iOS draws such a View as an attachment in the Text's
 * attributed string, which is all VoiceOver reads of it.
 */

interface HostNode {
  children: (HostNode | string)[];
  props: {
    accessibilityElementsHidden?: boolean;
    accessibilityLabel?: string;
    source?: unknown;
  };
  type: unknown;
}

const SF_SOURCE = /^sf:\/?(.+)$/u;

/** What VoiceOver reads of a View inside a Text. */
export const OBJECT_REPLACEMENT_CHARACTER = "\uFFFC";

const isText = (node: HostNode) => node.type === "Text";

/** A Text's attributed string: its text, each nested View an attachment. */
const textContent = (node: HostNode): string =>
  node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }

      return isText(child) ? textContent(child) : OBJECT_REPLACEMENT_CHARACTER;
    })
    .join("");

const symbolName = (source: unknown): string | null => {
  if (typeof source === "string") {
    return SF_SOURCE.exec(source)?.[1] ?? null;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const name = symbolName(item);

      if (name) {
        return name;
      }
    }

    return null;
  }

  if (source && typeof source === "object" && "uri" in source) {
    return symbolName(source.uri);
  }

  return null;
};

const ownLabel = (node: HostNode): string | null => {
  const { accessibilityLabel } = node.props;

  if (typeof accessibilityLabel === "string") {
    return accessibilityLabel;
  }

  if (isText(node)) {
    return textContent(node);
  }

  return symbolName(node.props.source);
};

const childrenLabel = (node: HostNode): string =>
  node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }

      if (child.props.accessibilityElementsHidden === true) {
        return "";
      }

      return ownLabel(child) ?? childrenLabel(child);
    })
    .filter((label) => label.length > 0)
    .join(", ");

/** The label VoiceOver reads for `element`, as iOS composes it. */
export const spokenLabel = (element: unknown): string => {
  const node = element as HostNode;

  return ownLabel(node) ?? childrenLabel(node);
};
