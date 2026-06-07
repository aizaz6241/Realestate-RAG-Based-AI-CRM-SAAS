import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET || 'SECRET_KEY_FOR_DEV';
    console.log("JWTSTRATEGY SECRET IS:", secret);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    // The payload returned here will be attached to the Request object as req.user
    return { 
      id: payload.sub, 
      email: payload.email, 
      role: payload.role,
      organizationId: payload.organizationId,
      isSystemAdmin: payload.isSystemAdmin
    };
  }
}
