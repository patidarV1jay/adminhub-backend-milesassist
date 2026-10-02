import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, LocationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBookingDto {
  @ApiPropertyOptional({ example: '2026-10-20T10:00:00Z', description: 'New start time (reschedule)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'EST' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @ApiPropertyOptional({ example: 'https://zoom.us/j/123456789' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  meetingLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 180, description: 'Cannot be changed once the booking is paid' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amount?: number;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'PENDING -> CONFIRMED | CANCELLED, CONFIRMED -> COMPLETED | CANCELLED',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ example: 'Customer requested a different date', description: 'Only with status = CANCELLED' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cancellationReason?: string;
}
