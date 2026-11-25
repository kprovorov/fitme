/** One run of a scheduled job. Rejecting fails the run. */
export type Job = () => Promise<void>;
