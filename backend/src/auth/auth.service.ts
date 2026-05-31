import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    console.log(`🔍 [AuthService] Validating user: "${email}"`);
    const user = await this.usersService.findOne(email);
    if (!user) {
      console.log(`❌ [AuthService] User "${email}" not found in database!`);
      return null;
    }
    
    const isPasswordMatch = await bcrypt.compare(pass, user.passwordHash);
    console.log(`🔑 [AuthService] User found. Password match: ${isPasswordMatch ? 'YES' : 'NO'}`);
    
    if (isPasswordMatch) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { 
      email: user.email, 
      sub: user.id, 
      role: user.role,
      organizationId: user.organizationId 
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      }
    };
  }
}
