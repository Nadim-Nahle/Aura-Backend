import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeaderValue = req.header('auth-api');
    const secretKey = process.env.SECRET_KEY;
    if (authHeaderValue === secretKey) {
      // Header is valid, continue to the next middleware
      next();
    } else {
      // Header is not valid, return a 401 Unauthorized response
      res.status(401).json({ message: 'Unauthorizeddd' });
    }
  }
}
