import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.UserUncheckedCreateInput) {
    const hashedPassword = await bcrypt.hash(data.passwordHash, 10);
    return this.prisma.user.create({
      data: {
        ...data,
        passwordHash: hashedPassword,
      },
    });
  }
}
