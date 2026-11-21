import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { StatItem } from "~/components/stat-item";

// Jest lays no text out, so what keeps a long value (Ukrainian's
// `3,6 тис. фунт`) on one line is the props the value is drawn with.
describe("StatItem", () => {
  it("shrinks a long value to fit one line side by side", async () => {
    await render(
      <StatItem
        accessibilityLabel="Обсяг: 3,6 тисячі фунтів"
        stacked={false}
        title="Обсяг"
        value="3,6 тис. фунт"
      />
    );

    const value = screen.getByText("3,6 тис. фунт");

    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  it("lets a stacked value wrap at its own size", async () => {
    await render(
      <StatItem
        accessibilityLabel="Обсяг: 3,6 тисячі фунтів"
        stacked
        title="Обсяг"
        value="3,6 тис. фунт"
      />
    );

    const value = screen.getByText("3,6 тис. фунт");

    expect(value.props.numberOfLines).toBeUndefined();
    expect(value.props.adjustsFontSizeToFit).toBeFalsy();
  });
});
