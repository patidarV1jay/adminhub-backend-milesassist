import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundTransactionDto {
  @ApiPropertyOptional({ example: 'Customer requested a refund' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
