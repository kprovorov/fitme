/**
 * The context menu stand-in, as a screen test drives it: a long press on the
 * trigger opens the menu, each item is a `menuitem` named by its label,
 * pressing one runs it and closes the menu, a disabled one can't be pressed
 * and a destructive one is marked so.
 */
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ContextMenu } from "~/components/ui/context-menu";
import { DESTRUCTIVE_HINT } from "~/test-utils/context-menu-stub";

jest.mock("~/components/ui/context-menu", () =>
  jest.requireActual("~/test-utils/context-menu-stub")
);

const renderMenu = async () => {
  const edit = jest.fn();
  const remove = jest.fn();
  const archive = jest.fn();

  await render(
    <ContextMenu
      items={[
        { label: "Edit", onPress: edit, systemImage: "pencil" },
        { disabled: true, label: "Archive", onPress: archive },
        { destructive: true, label: "Delete", onPress: remove },
      ]}
      testID="plan-menu"
    >
      <Text>Push Pull Legs</Text>
    </ContextMenu>
  );

  return { archive, edit, remove };
};

describe("the context menu stand-in", () => {
  it("shows its trigger and no item until a long press", async () => {
    await renderMenu();

    expect(screen.getByText("Push Pull Legs")).toBeOnTheScreen();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);

    await fireEvent(screen.getByTestId("plan-menu"), "longPress");

    expect(
      screen
        .getAllByRole("menuitem")
        .map((item) => item.props.accessibilityLabel)
    ).toEqual(["Edit", "Archive", "Delete"]);
  });

  it("opens on a long press only, never a tap", async () => {
    await renderMenu();

    await fireEvent.press(screen.getByTestId("plan-menu"));

    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("runs the item pressed and closes the menu", async () => {
    const { edit, remove } = await renderMenu();

    await fireEvent(screen.getByTestId("plan-menu"), "longPress");
    await fireEvent.press(screen.getByRole("menuitem", { name: "Edit" }));

    expect(edit).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("can't press a disabled item", async () => {
    const { archive } = await renderMenu();

    await fireEvent(screen.getByTestId("plan-menu"), "longPress");
    const item = screen.getByRole("menuitem", { name: "Archive" });

    expect(item).toBeDisabled();

    await fireEvent.press(item);

    expect(archive).not.toHaveBeenCalled();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("marks a destructive item, and only that one", async () => {
    await renderMenu();

    await fireEvent(screen.getByTestId("plan-menu"), "longPress");

    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveProp(
      "accessibilityHint",
      DESTRUCTIVE_HINT
    );
    expect(screen.getByRole("menuitem", { name: "Edit" })).not.toHaveProp(
      "accessibilityHint",
      DESTRUCTIVE_HINT
    );
  });
});
