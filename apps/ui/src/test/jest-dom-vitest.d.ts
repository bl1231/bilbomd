// @testing-library/jest-dom 7.0.1 augments vitest's old `Assertion<T>`, which
// no longer merges with vitest 5's `Assertion<R, T>`, so its matchers vanish
// from the types (testing-library/jest-dom#738). vitest 5 folds `Matchers<R, T>`
// into both `expect()` and the asymmetric matchers, so augment that instead.
// Delete this file once jest-dom ships vitest 5 types (testing-library/jest-dom#742).
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  // Merging needs vitest's exact type parameters (T included, though unused)
  // and an otherwise empty body.
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown
  > extends TestingLibraryMatchers<unknown, R> {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
}
