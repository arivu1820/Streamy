import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // WebSocket gateways authenticate the connection themselves (handleConnection);
    // this HTTP guard must not run on socket message handlers.
    if (ctx.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-streamy-secret-change-in-prod',
      });
      req.user = { id: payload.sub, email: payload.email, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED' });
    }
  }
}

/** Verify a JWT outside the HTTP guard (used by socket gateways). */
export function verifySocketToken(jwt: JwtService, token?: string): AuthUser | null {
  if (!token) return null;
  try {
    const p: any = jwt.verify(token, {
      secret: process.env.JWT_SECRET || 'dev-streamy-secret-change-in-prod',
    });
    return { id: p.sub, email: p.email, username: p.username };
  } catch {
    return null;
  }
}
