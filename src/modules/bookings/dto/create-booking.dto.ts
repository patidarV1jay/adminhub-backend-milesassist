import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, LocationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid', description: 'Customer (user) the booking is for' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ format: 'uuid', description: 'Service id from GET /services' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ example: '2026-10-15T14:00:00Z', description: 'Start time, must be in the future' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ example: 90, description: "Minutes (15-480). Defaults to the service's default duration" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'EST', default: 'EST' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ enum: LocationType, default: LocationType.VIRTUAL })
  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @ApiPropertyOptional({ example: 'https://zoom.us/j/123456789' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  meetingLink?: string;

  @ApiPropertyOptional({ example: 'Need assistance with expanding our payment gateway options.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 180, description: "Billing amount. Defaults to the service's price" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amount?: number;

  @ApiPropertyOptional({ enum: [BookingStatus.PENDING, BookingStatus.CONFIRMED], default: BookingStatus.PENDING })
  @IsOptional()
  @IsIn([BookingStatus.PENDING, BookingStatus.CONFIRMED], { message: 'status must be PENDING or CONFIRMED' })
  status?: BookingStatus;
}
