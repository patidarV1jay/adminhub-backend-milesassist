import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { ChartQueryDto } from './dto/chart-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'KPI cards: total users, revenue, active bookings, pending transactions (with % change)' })
  stats() {
    return this.dashboard.getStats();
  }

  @Get('charts')
  @ApiOperation({ summary: 'Revenue overview chart series for the selected range (7D, 1M, 3M, 6M, 1Y)' })
  charts(@Query() query: ChartQueryDto) {
    return this.dashboard.getCharts(query.range);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'System alerts: live-computed (capacity, pending/failed transactions) plus stored notices' })
  alerts() {
    return this.dashboard.getAlerts();
  }

  @Get('system-health')
  @ApiOperation({ summary: 'System Health panel: uptime, average response time, active sessions' })
  systemHealth() {
    return this.dashboard.getSystemHealth();
  }
}
