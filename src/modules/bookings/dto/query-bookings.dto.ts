import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DateRangeQueryDto } from '../../../common/dto/pagination.dto';


export enum BookingSortField {
  SCHEDULED_AT = 'scheduledAt',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  NUMBER = 'number', 
}

export class QueryBookingsDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Service Type filter (id from GET /services)' })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Only bookings of this customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: BookingSortField, default: BookingSortField.SCHEDULED_AT })
  @IsOptional()
  @IsEnum(BookingSortField)
  sortBy: BookingSortField = BookingSortField.SCHEDULED_AT;
}
