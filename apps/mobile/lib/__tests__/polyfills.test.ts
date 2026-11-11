import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// These tests exercise synchronous array setup, not the native stream setup.
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

jest.mock("@ungap/structured-clone", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const methods = ["toSorted", "toReversed"] as const;

const originals = methods.map((method) =>
  Object.getOwnPropertyDescriptor(Array.prototype, method)
);

beforeEach(() => {
  for (const method of methods) {
    Reflect.deleteProperty(Array.prototype, method);
  }
});

afterEach(() => {
  for (const [index, method] of methods.entries()) {
    const original = originals[index];

    if (original) {
      // oxlint-disable-next-line eslint/no-extend-native -- Restore the original runtime after the missing-method simulation.
      Object.defineProperty(Array.prototype, method, original);
    } else {
      Reflect.deleteProperty(Array.prototype, method);
    }
  }
});

const loadPolyfills = () => {
  jest.isolateModules(() => jest.requireActual("@/polyfills"));
};

describe("array methods on Hermes versions without ES2023 copying methods", () => {
  it("installs toSorted synchronously and sorts a copy", () => {
    expect(Array.prototype.toSorted).toBeUndefined();
    loadPolyfills();

    const values = Object.freeze([3, 1, 2]);
    expect(values.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(values).toEqual([3, 1, 2]);
  });

  it("installs toReversed synchronously and reverses a copy", () => {
    expect(Array.prototype.toReversed).toBeUndefined();
    loadPolyfills();

    const values = Object.freeze([3, 1, 2]);
    expect(values.toReversed()).toEqual([2, 1, 3]);
    expect(values).toEqual([3, 1, 2]);
  });
});
