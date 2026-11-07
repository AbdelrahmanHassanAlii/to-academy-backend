import 'express-session';
import type { AuthSessionIdentity } from '../../modules/auth/model/auth-session.js';

declare module 'express-session' {
  interface SessionData extends AuthSessionIdentity {
    csrfToken?: string;
    expiresAt?: number;
  }
}
