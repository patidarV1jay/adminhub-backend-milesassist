import { User } from '@prisma/client';
import { formatRef } from '../../common/utils/reference.util';

export function toUserResponse(user: User) {
  return {
    id: user.id,
    reference: formatRef('USR', user.number),
    name: user.name,
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    address: user.address,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    lastActiveAt: user.lastActiveAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
