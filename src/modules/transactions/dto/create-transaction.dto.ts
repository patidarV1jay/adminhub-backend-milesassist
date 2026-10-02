import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ format: 'uuid', description: 'Customer the transaction belongs to' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Booking this payment is for' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ enum: [TransactionType.PAYMENT, TransactionType.TRANSFER], default: TransactionType.PAYMENT })
  @IsOptional()
  @IsIn([TransactionType.PAYMENT, TransactionType.TRANSFER], {
    message: 'type must be PAYMENT or TRANSFER (refunds are created through POST /transactions/:id/refund)',
  })
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: [TransactionStatus.PENDING, TransactionStatus.COMPLETED, TransactionStatus.FAILED],
    default: TransactionStatus.PENDING,
  })
  @IsOptional()
  @IsIn([TransactionStatus.PENDING, TransactionStatus.COMPLETED, TransactionStatus.FAILED], {
    message: 'status must be PENDING, COMPLETED or FAILED',
  })
  status?: TransactionStatus;

  @ApiProperty({ example: 145.1, description: 'Amount before the gateway fee' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  subtotal!: number;

  @ApiPropertyOptional({ example: 4.9, default: 0, description: 'Total amount = subtotal + gatewayFee' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  gatewayFee?: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ example: 'Credit Card' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  paymentMethod!: string;

  @ApiPropertyOptional({ example: 'Visa' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardBrand?: string;

  @ApiPropertyOptional({ example: '4582' })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'cardLast4 must be exactly 4 digits' })
  cardLast4?: string;

  @ApiPropertyOptional({ example: 'Service Payment' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'REF-98342718', description: 'Payment gateway reference (must be unique)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gatewayReference?: string;
}
