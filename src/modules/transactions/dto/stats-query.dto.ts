import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class TransactionStatsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Start date (inclusive). Omit for all time.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'End date (inclusive)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
