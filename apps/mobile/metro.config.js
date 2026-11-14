/// <reference types="node" />

import path from "node:path";

import { getSentryExpoConfig } from "@sentry/react-native/metro.js";
import { withUniwindConfig } from "uniwind/metro";

/** @typedef {new (options: { root: string }) => object} CacheStoreClass */

const config = getSentryExpoConfig(import.meta.dirname);

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  polyfills: { rem: 16 },
});

/**
 * uniwind replaces Metro's cache with its own store (one that skips the CSS it
 * must rebuild) rooted at `$TMPDIR/metro-cache`, which every worktree on the
 * machine shares: `expo start --clear` in one wipes it while another
 * worktree's Metro is writing to it (ENOTEMPTY). This keeps uniwind's store,
 * rooted in this worktree instead.
 *
 * @param {readonly { constructor: CacheStoreClass }[]} stores uniwind's cache stores.
 * @returns {object[]} The same stores, rooted in this worktree.
 */
const rootedInWorktree = (stores) =>
  stores.map(
    (store) =>
      new store.constructor({
        root: path.join(import.meta.dirname, "node_modules/.cache/metro"),
      })
  );

export default {
  ...uniwindConfig,
  cacheStores: rootedInWorktree(uniwindConfig.cacheStores),
};
