import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTransactionStatusDto {
  @ApiProperty({ enum: TransactionStatus, description: 'Allowed: PENDING -> COMPLETED | FAILED, FAILED -> PENDING' })
  @IsEnum(TransactionStatus)
  status!: TransactionStatus;

  @ApiPropertyOptional({ example: 'Settled in merchant bank account' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
