import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { TransactionStatsQueryDto } from './dto/stats-query.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated transaction list with search, filters, date range and sorting' })
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactions.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Total transactions, volume, average and success rate (with sparkline trend)' })
  stats(@Query() query: TransactionStatsQueryDto) {
    return this.transactions.stats(query);
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the filtered transactions as CSV (max 10,000 rows)' })
  async export(@Query() query: QueryTransactionsDto) {
    const csv = await this.transactions.exportCsv(query);
    const date = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="transactions-${date}.csv"`,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction detail: invoice, customer, processing history, related ledger entries' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a transaction (amount = subtotal + gateway fee)' })
  create(@Body() dto: CreateTransactionDto, @CurrentUser() actor: AuthUser) {
    return this.transactions.create(dto, actor);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update status (PENDING -> COMPLETED/FAILED, FAILED -> PENDING)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.transactions.updateStatus(id, dto, actor);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Refund a completed payment (creates a negative REFUND entry)' })
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundTransactionDto, @CurrentUser() actor: AuthUser) {
    return this.transactions.refund(id, dto, actor);
  }
}
