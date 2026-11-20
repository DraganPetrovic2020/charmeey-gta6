// A tiny event bus so systems can react to each other (gunfire scares people, a kill adds heat,
// a wrecked van advances a mission) without importing one another.
export function createEvents() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      for (const fn of [...set]) fn(payload);
    },
  };
}
