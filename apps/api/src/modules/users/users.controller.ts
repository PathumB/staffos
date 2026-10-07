import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  type Paginated,
  type Role,
  roleSchema,
  updateUserSchema,
  type User,
  userListQuerySchema,
  userSchema,
} from '@staffos/shared';
import { z } from 'zod';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators';
import {
  ApiListQuery,
  ApiZodBody,
  ApiZodOkResponse,
  createZodDto,
} from '../../common/validation/zod';
import { UsersService } from './users.service';

class UserListQueryDto extends createZodDto(userListQuerySchema) {}
class CreateUserDto extends createZodDto(createUserSchema) {}
class UpdateUserDto extends createZodDto(updateUserSchema) {}

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users' })
  @ApiListQuery(['status', 'role'])
  @ApiZodOkResponse(z.object({ data: z.array(userSchema) }))
  list(@Query() query: UserListQueryDto): Promise<Paginated<User>> {
    return this.users.list(query);
  }

  @Post('users')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Create a user and email an invitation' })
  @ApiZodBody(createUserSchema)
  @ApiZodOkResponse(userSchema)
  create(@Body() body: CreateUserDto, @CurrentActor() actor: Actor): Promise<User> {
    return this.users.create(body, actor);
  }

  @Get('users/:id')
  @RequirePermissions('users:read')
  @ApiZodOkResponse(userSchema)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.users.get(id);
  }

  @Patch('users/:id')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Update name or roles (role changes end the user’s sessions)' })
  @ApiZodBody(updateUserSchema)
  @ApiZodOkResponse(userSchema)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
    @CurrentActor() actor: Actor,
  ): Promise<User> {
    return this.users.update(id, body, actor);
  }

  @Post('users/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:manage')
  @ApiZodOkResponse(userSchema)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor): Promise<User> {
    return this.users.deactivate(id, actor);
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:manage')
  @ApiZodOkResponse(userSchema)
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.users.reactivate(id);
  }

  @Post('users/:id/resend-invitation')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('users:manage')
  resendInvitation(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.users.resendInvitation(id);
  }

  @Get('roles')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Roles with their permissions (permission matrix)' })
  @ApiZodOkResponse(z.array(roleSchema))
  roles(): Promise<Role[]> {
    return this.users.listRoles();
  }
}
