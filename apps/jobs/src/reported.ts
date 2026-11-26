/**
 * A run's failure whose causes were each reported already: the handler fails
 * the run with it but doesn't report it again.
 */
export class AlreadyReportedError extends Error {
  override name = "AlreadyReportedError";
}
