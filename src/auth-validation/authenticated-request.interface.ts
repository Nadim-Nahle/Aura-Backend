import { DecodedIdToken } from 'firebase-admin/auth';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}
