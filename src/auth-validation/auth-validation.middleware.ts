import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeaderValue = req.header('auth-api');
    const secretKey = 'f80db53c-2ca4-4e38-a0d3-588a69bc7281';
    if (authHeaderValue === secretKey) {
      // Header is valid, continue to the next middleware
      next();
    } else {
      // Header is not valid, return a 401 Unauthorized response
      res.status(401).json({ message: 'Unauthorizeddd' });
    }
  }
}
