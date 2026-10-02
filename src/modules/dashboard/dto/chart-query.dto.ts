import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum ChartRange {
  D7 = '7D',
  M1 = '1M',
  M3 = '3M',
  M6 = '6M',
  Y1 = '1Y',
}

export class ChartQueryDto {
  @ApiPropertyOptional({ enum: ChartRange, default: ChartRange.M6, description: 'Matches the 7D / 1M / 3M / 6M / 1Y toggle' })
  @IsOptional()
  @IsEnum(ChartRange)
  range: ChartRange = ChartRange.M6;
}
