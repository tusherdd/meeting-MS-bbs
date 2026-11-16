/**
 * Test-only hooks (v1.6, SPEC.md §13.14): helpers for automated tests that must never exist on
 * a real server. They are loaded only when NODE_ENV=test, or when E2E_TEST_HOOKS=true outside
 * production (Playwright runs against the development API). Production never loads them:
 * this function says no, env validation refuses E2E_TEST_HOOKS=true, and the controller checks
 * again on every call.
 */
export function testHooksEnabled(
  env: Readonly<Record<string, string | boolean | undefined>>,
): boolean {
  const nodeEnv = String(env.NODE_ENV ?? 'development').trim();
  if (nodeEnv === 'production') return false;
  if (nodeEnv === 'test') return true;
  return (
    String(env.E2E_TEST_HOOKS ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}
