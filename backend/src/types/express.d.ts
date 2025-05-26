import { Server } from 'http';

declare global {
  // Extend the Express interface to include our server property
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface Application {
      server?: Server;
    }
  }
}
