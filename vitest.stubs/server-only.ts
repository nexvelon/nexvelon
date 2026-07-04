// Empty stub for the `server-only` guard package under vitest. The real package
// is a no-op marker that throws only when bundled into a client build; in tests
// (node/jsdom) we alias it here so server-only modules (lib/pdf/*, lib/storage/*,
// lib/api/*) can be imported and unit-tested. Aliased via vitest.config.ts.
export {};
