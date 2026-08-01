/**
 * Test-only re-exports.
 *
 * `verifyPortalToken` returns a typed rejection rather than throwing, which is what a
 * test needs to assert on. It is re-exported here under a name that makes it obvious
 * at the call site that a test is reaching for the raw verifier rather than the
 * `resolvePortal` boundary the product uses.
 */
export { mintPortalToken, verifyPortalToken as resolveAndVerifyForTest } from "@/lib/portal-tokens";
