import { Controller, Request, Post, UseGuards, Get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService
  ) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req) {
    // req.user is set by Passport's LocalStrategy
    return this.authService.login(req.user);
  }

  // A route to create the very first super admin / organization for testing
  @Post('register-tenant')
  async registerTenant(@Body() body: any) {
    // In production, this would be highly secured.
    const { orgName, domain, email, password, firstName, lastName } = body;
    
    // Create Org (requires PrismaService to be injected in UsersService or a separate TenantService, 
    // for MVP we can just use UsersService if we give it access to org creation)
    
    return { message: 'Tenant registration will be implemented in TenantService' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
