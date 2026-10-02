import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { toUserResponse } from '../users/users.mapper';
import type { JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';

const CONSOLE_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });

    const valid = user ? await compare(dto.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    if (!CONSOLE_ROLES.includes(user.role)) {
      throw new ForbiddenException('Your role does not have access to the admin console');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(`Your account is ${user.status.toLowerCase()}`);
    }

    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lastActiveAt: now } }),
      this.prisma.activityLog.create({
        data: { userId: user.id, action: 'Logged in', description: 'Signed in to the admin console' },
      }),
    ]);

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      user: toUserResponse(updated)
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return toUserResponse(user);
  }
}
