/**
 * Review worker: pulls jobs, produces low-noise inline findings.
 *
 * TODO:
 * - [ ] fetch PR diff + relevant file context (blast-radius expansion)
 * - [ ] load .mergemate.yml rulebook (see src/rules)
 * - [ ] Claude pass: bugs/security/standards, forced JSON findings schema
 * - [ ] confidence filter: only post findings above threshold (low-noise mode)
 * - [ ] post inline comments + suggested patches; update check-run summary
 * - [ ] learn-from-dismissals loop: dismissed findings lower similar-rule weight
 */
export {};
