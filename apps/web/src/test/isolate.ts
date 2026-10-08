// Runs before setup.ts (and before any app module is imported).
// session.ts syncs logout across browser tabs with BroadcastChannel. In Node, a channel reaches
// every worker thread, so one test file signing out would sign out tests running in parallel
// (seen as flaky dialogs in CI). Removing it keeps each test file isolated.
Reflect.deleteProperty(globalThis, 'BroadcastChannel');
