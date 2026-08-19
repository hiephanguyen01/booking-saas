/**
 * A repository port with only the methods this test needs.
 *
 * Anything else throws by name instead of returning `undefined`, so a use case
 * that starts calling a second port method fails loudly in the test that did not
 * anticipate it rather than silently reading `undefined` and passing.
 */
export function fakePort<T extends object>(stubs: Partial<T>): T {
  return new Proxy(stubs, {
    get(target, property, receiver) {
      // `await`, `expect()` and the inspector probe objects for these; answering
      // "not stubbed" to a probe would turn a passing test into a crash.
      if (typeof property === 'symbol' || property === 'then' || property === 'constructor') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      if (property in target) return Reflect.get(target, property, receiver) as unknown;
      throw new Error(`port method "${property}" was called but this test did not stub it`);
    },
  }) as T;
}
