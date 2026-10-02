import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { DateRangeQueryDto } from '../../../common/dto/pagination.dto';

export enum TransactionSortField {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  NUMBER = 'number',
}

export class QueryTransactionsDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ description: 'Only transactions of this customer' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Minimum stored amount (refunds are stored as negative amounts)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum stored amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @ApiPropertyOptional({ enum: TransactionSortField, default: TransactionSortField.CREATED_AT })
  @IsOptional()
  @IsEnum(TransactionSortField)
  sortBy: TransactionSortField = TransactionSortField.CREATED_AT;
}
