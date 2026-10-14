// What the auth middleware (middleware/auth.js) puts on the Express request.
declare global {
  namespace Express {
    /** The signed-in user: from a login token, or the owner of an API key. */
    interface AuthenticatedUser {
      id: string | number;
      email?: string;
      role?: string;
      /** Set when the request was authenticated with an API key */
      api_key_id?: string;
      api_key_permissions?: string[];
      [claim: string]: unknown;
    }

    interface Request {
      user?: AuthenticatedUser;
      /** Marks, set when a router is mounted, that decide what an API key may do */
      apiKeyMinScope?: string;
      apiKeyForbidden?: boolean;
    }
  }
}

export {};
