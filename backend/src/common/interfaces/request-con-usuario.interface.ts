import { Request } from 'express';
import { JwtPayload } from './jwt-payload.interface';

export interface RequestConUsuario extends Request {
  user: JwtPayload;
}
