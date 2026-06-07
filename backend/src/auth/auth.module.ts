import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET || 'SECRET_KEY_FOR_DEV';
        console.log("JWTMODULE REGISTER SECRET IS:", secret);
        return {
          secret,
          signOptions: { expiresIn: '1d' }, // Change session expiration to 1 day for convenience
        };
      },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
