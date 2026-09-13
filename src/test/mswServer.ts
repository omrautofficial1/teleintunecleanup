import { setupServer } from 'msw/node';

// Started/stopped in src/test/setup.ts. Individual test files register
// per-test handlers with server.use(...) and server.resetHandlers()
// clears them between tests.
export const server = setupServer();
