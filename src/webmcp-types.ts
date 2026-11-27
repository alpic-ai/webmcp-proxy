/**
 * Compatibility additions missing from webmcp-types 0.1.11.
 * Remove these overrides once the upstream types include the new API.
 */
export interface ModelContextWithReadiness extends WebMCP.ModelContext {
  /**
   * Signals that tool setup is pending until the promise settles.
   * Optional because older browsers and polyfills do not implement it.
   * @see https://github.com/webmachinelearning/webmcp/pull/373
   */
  waitForToolsUntil?: (promise: Promise<unknown>) => void;
}
