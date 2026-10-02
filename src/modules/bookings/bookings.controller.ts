import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated booking list with search, status/service filters, date range and sorting' })
  findAll(@Query() query: QueryBookingsDto) {
    return this.bookings.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Total, active, completed and cancelled bookings with % change' })
  stats() {
    return this.bookings.stats();
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the filtered bookings as CSV (max 10,000 rows)' })
  async export(@Query() query: QueryBookingsDto) {
    const csv = await this.bookings.exportCsv(query);
    const date = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="bookings-${date}.csv"`,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Booking detail: logistics, payment, customer overview and lifecycle log' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a booking (checks for customer time conflicts)' })
  create(@Body() dto: CreateBookingDto, @CurrentUser() actor: AuthUser) {
    return this.bookings.create(dto, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update, reschedule (scheduledAt) or cancel (status = CANCELLED) a booking' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookingDto, @CurrentUser() actor: AuthUser) {
    return this.bookings.update(id, dto, actor);
  }
}
