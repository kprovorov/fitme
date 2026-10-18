/**
 * Bounds on a set's reps and weight, shared by every app that takes them: the
 * mobile set inputs, MCP's plan and session tools, the Coach's Plan edits.
 * Weights are stored as numeric(8,2), so a weight has at most 2 decimals.
 */
export const MAX_REPS = 1000;
export const MAX_WEIGHT = 10_000;
export const MAX_WEIGHT_DECIMALS = 2;
