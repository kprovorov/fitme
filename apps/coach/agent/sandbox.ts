import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// The Coach has no shell or file tools (defaultTools: false), but eve still
// prepares a sandbox at build time. just-bash is in-process JavaScript: no
// container, VM or Vercel Sandbox snapshot to build or pay for.
export const environment = JustBashSandbox.environment({ autoInstall: false });
export default defineSandbox(() => environment.open());
