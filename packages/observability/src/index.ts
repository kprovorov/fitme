// Pure rules shared by every platform: no SDK import, so Node, React Native
// and Next can all read this entry. The Node setup is @fitme/observability/node.
export {
  type ObservabilityConfig,
  type ObservabilityEnv,
  resolveObservabilityConfig,
} from "./config";
export { tracePropagationTargets } from "./propagation";
export { type ScrubbableEvent, SECRET_HEADERS, scrubEvent } from "./scrub";
