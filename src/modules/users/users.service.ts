import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { AuthUser } from '../auth/auth.types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginated, skipTake, toPrismaOrder } from '../../common/utils/pagination.util';
import { formatRef, parseRef } from '../../common/utils/reference.util';
import { PrismaService } from '../../prisma/prisma.service';
import { BulkRoleDto, BulkStatusDto } from './dto/bulk-update.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto, UserSortField } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponse } from './users.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUsersDto) {
    const { page, limit, search, role, status, sortBy, sortOrder } = query;

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (role) where.role = role;
    if (status) where.status = status;

    const term = search?.trim();
    if (term) {
      const or: Prisma.UserWhereInput[] = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
      if (/^#?(usr-?)?\d+$/i.test(term)) {
        const n = parseRef(term);
        if (n !== null) or.push({ number: n });
      }
      where.OR = or;
    }

    const dir = toPrismaOrder(sortOrder);
    let orderBy: Prisma.UserOrderByWithRelationInput;
    switch (sortBy) {
      case UserSortField.NAME:
        orderBy = { name: dir };
        break;
      case UserSortField.EMAIL:
        orderBy = { email: dir };
        break;
      case UserSortField.LAST_ACTIVE_AT:
        orderBy = { lastActiveAt: dir };
        break;
      default:
        orderBy = { createdAt: dir };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, ...skipTake(page, limit) }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toUserResponse), total, page, limit);
  }

  async stats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const base: Prisma.UserWhereInput = { deletedAt: null };

    const [total, active, inactive, suspended, newThisMonth] = await Promise.all([
      this.prisma.user.count({ where: base }),
      this.prisma.user.count({ where: { ...base, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { ...base, status: UserStatus.INACTIVE } }),
      this.prisma.user.count({ where: { ...base, status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { ...base, createdAt: { gte: startOfMonth } } }),
    ]);
    return { totalUsers: total, activeUsers: active, inactiveUsers: inactive, suspendedUsers: suspended, newThisMonth };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { transactions: true, bookings: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, number: true, amount: true, status: true, type: true, createdAt: true },
        },
        bookings: {
          orderBy: { scheduledAt: 'desc' },
          take: 5,
          select: {
            id: true,
            number: true,
            status: true,
            scheduledAt: true,
            service: { select: { name: true } },
          },
        },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...toUserResponse(user),
      totals: { transactions: user._count.transactions, bookings: user._count.bookings },
      recentTransactions: user.transactions.map((t) => ({
        id: t.id,
        reference: formatRef('TXN', t.number),
        amount: t.amount.toNumber(),
        type: t.type,
        status: t.status,
        createdAt: t.createdAt,
      })),
      recentBookings: user.bookings.map((b) => ({
        id: b.id,
        reference: formatRef('BKG', b.number),
        service: b.service.name,
        status: b.status,
        scheduledAt: b.scheduledAt,
      })),
      recentActivity: user.activityLogs.map((a) => ({
        id: a.id,
        action: a.action,
        description: a.description,
        createdAt: a.createdAt,
      })),
    };
  }

  async findActivity(id: string, query: PaginationQueryDto) {
    await this.getActiveUser(id);
    const { page, limit, sortOrder } = query;
    const where: Prisma.ActivityLogWhereInput = { userId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: toPrismaOrder(sortOrder) },
        ...skipTake(page, limit),
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return paginated(rows, total, page, limit);
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    if (dto.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can create another super admin');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await hash(dto.password, 12),
        role: dto.role,
        status: dto.status,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        avatarUrl: dto.avatarUrl,
        twoFactorEnabled: dto.twoFactorEnabled,
      },
    });
    await this.log(user.id, 'Account created', `Created by ${actor.name}`, actor.id);
    return toUserResponse(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.getActiveUser(id);
    this.assertCanManage(actor, target);

    const roleChanging = dto.role !== undefined && dto.role !== target.role;
    const statusChanging = dto.status !== undefined && dto.status !== target.status;

    if (id === actor.id && (roleChanging || statusChanging)) {
      throw new ForbiddenException('You cannot change your own role or status');
    }
    if (dto.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can assign the super admin role');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        status: dto.status,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        avatarUrl: dto.avatarUrl,
        twoFactorEnabled: dto.twoFactorEnabled,
      },
    });

    if (roleChanging) await this.log(id, `Role changed to ${updated.role}`, `Updated by ${actor.name}`, actor.id);
    if (statusChanging) await this.log(id, `Status changed to ${updated.status}`, `Updated by ${actor.name}`, actor.id);
    if (!roleChanging && !statusChanging) await this.log(id, 'Profile updated', `Updated by ${actor.name}`, actor.id);

    return toUserResponse(updated);
  }

  async remove(id: string, actor: AuthUser) {
    if (id === actor.id) throw new ForbiddenException('You cannot delete your own account');
    const target = await this.getActiveUser(id);
    this.assertCanManage(actor, target);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.INACTIVE }, // soft delete keeps transaction history intact
    });
    return { id, deleted: true };
  }

  async bulkChangeRole(dto: BulkRoleDto, actor: AuthUser) {
    if (dto.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can assign the super admin role');
    }
    return this.bulkUpdate(dto.ids, { role: dto.role }, `Role changed to ${dto.role}`, actor);
  }

  async bulkChangeStatus(dto: BulkStatusDto, actor: AuthUser) {
    return this.bulkUpdate(dto.ids, { status: dto.status }, `Status changed to ${dto.status}`, actor);
  }

  private async bulkUpdate(
    ids: string[],
    data: Prisma.UserUpdateManyMutationInput,
    label: string,
    actor: AuthUser,
  ) {
    if (ids.includes(actor.id)) {
      throw new ForbiddenException('You cannot include your own account in a bulk action');
    }

    const targets = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, role: true },
    });
    if (targets.length !== ids.length) throw new NotFoundException('One or more users were not found');
    if (actor.role !== UserRole.SUPER_ADMIN && targets.some((t) => t.role === UserRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Only a super admin can modify a super admin');
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { id: { in: ids } }, data }),
      this.prisma.activityLog.createMany({
        data: ids.map((userId) => ({
          userId,
          action: label,
          description: `Updated by ${actor.name}`,
          metadata: { by: actor.id },
        })),
      }),
    ]);
    return { requested: ids.length, updated: ids.length };
  }

  private async getActiveUser(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private assertCanManage(actor: AuthUser, target: User) {
    if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can modify a super admin');
    }
  }

  private log(userId: string, action: string, description: string, byId: string) {
    return this.prisma.activityLog.create({ data: { userId, action, description, metadata: { by: byId } } });
  }
}
