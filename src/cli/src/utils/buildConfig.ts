/**
 * CHP CLI build-time constants.
 *
 * These replace process.env checks that were only meaningful in Anthropic's
 * internal build. In CHP CLI all such gates are permanently disabled so
 * external users cannot activate internal code paths by setting env vars.
 */

/**
 * Always false in CHP CLI.
 * Replaces all `process.env.USER_TYPE === 'ant'` checks so that no external
 * user can activate Anthropic-internal features (commit attribution hooks,
 * system-prompt section clearing, dangerously-skip-permissions bypass, etc.)
 * by setting USER_TYPE in their shell environment.
 */
export function isAntEmployee(): boolean {
  return false
}
