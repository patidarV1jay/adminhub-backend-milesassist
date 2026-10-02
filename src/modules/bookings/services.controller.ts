import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from "../../prisma/prisma.service";
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Services')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('services')
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Active services (feeds the Service Type filter and the New Booking form)' })
  async findAll() {
    const services = await this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return services.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price.toNumber(),
      defaultDurationMinutes: s.defaultDurationMinutes,
    }));
  }
}
