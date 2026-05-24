import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: any, status?: any) {
    if (err || !user) {
      console.warn("=== JWT AUTHENTICATION FAILURE ===");
      console.warn("Error object:", err);
      console.warn("User object:", user);
      console.warn("Passport Info / Message:", info ? info.message : 'No info message available');
      console.warn("Full info object:", info);
      console.warn("==================================");
      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }
    return user;
  }
}

