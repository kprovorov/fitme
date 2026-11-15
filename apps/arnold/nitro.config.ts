// Read by the nitro build `eve build` runs (eve passes no source map option of
// its own): the server bundle gets source maps, which
// scripts/upload-source-maps.ts uploads to Sentry.
//
// The Vercel runtime is set explicitly: nitro's Vercel preset only knows Node
// 20, 22 and 24, so a build on Node 26 would otherwise serve its functions on
// nodejs24.x. Keep it on the major `engines.node` names.
export default {
  sourcemap: true,
  vercel: { functions: { runtime: "nodejs26.x" } },
};
