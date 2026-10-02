import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { BulkRoleDto, BulkStatusDto } from './dto/bulk-update.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with search, role/status filters, sorting and pagination' })
  findAll(@Query() query: QueryUsersDto) {
    return this.users.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Total, active and new-this-month user counts' })
  stats() {
    return this.users.stats();
  }

  @Patch('bulk/role')
  @ApiOperation({ summary: 'Change the role of several users at once' })
  bulkRole(@Body() dto: BulkRoleDto, @CurrentUser() actor: AuthUser) {
    return this.users.bulkChangeRole(dto, actor);
  }

  @Patch('bulk/status')
  @ApiOperation({ summary: 'Change the status of several users at once (e.g. suspend accounts)' })
  bulkStatus(@Body() dto: BulkStatusDto, @CurrentUser() actor: AuthUser) {
    return this.users.bulkChangeStatus(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User detail with recent transactions, bookings and activity' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Paginated activity log of a user' })
  activity(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.users.findActivity(id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (profile, role, status)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.users.remove(id, actor);
  }
}
