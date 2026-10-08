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
import { ApiConflictResponse, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  departmentInputSchema,
  departmentSchema,
  type Department,
  type Employee,
  employeeListQuerySchema,
  employeeSchema,
  employeeUpdateSchema,
  type Paginated,
  type Position,
  positionInputSchema,
  positionSchema,
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
import { EmployeesService } from './employees.service';
import { OrgService } from './org.service';

class ListQueryDto extends createZodDto(employeeListQuerySchema) {}
class UpdateDto extends createZodDto(employeeUpdateSchema) {}
class DepartmentDto extends createZodDto(departmentInputSchema) {}
class PositionDto extends createZodDto(positionInputSchema) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Employees you may see (HR, Finance, own clients, or yourself)' })
  @ApiListQuery(['status', 'departmentId', 'clientId'])
  @ApiZodOkResponse(z.object({ data: z.array(employeeSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Employee>> {
    return this.employees.list(query, actor);
  }

  @Get(':id')
  @RequirePermissions('employees:read')
  @ApiZodOkResponse(employeeSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Employee> {
    return this.employees.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'HR edits; an employee may change only their own email and phone' })
  @ApiForbiddenResponse({ description: 'EMPLOYEE_FIELDS_RESTRICTED' })
  @ApiConflictResponse({ description: 'STALE_VERSION or EMPLOYEE_TERMINATED' })
  @ApiZodBody(employeeUpdateSchema)
  @ApiZodOkResponse(employeeSchema)
  update(
    @Id() id: string,
    @Body() body: UpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<Employee> {
    return this.employees.update(id, body, actor);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('employees:write')
  @ApiOperation({
    summary: 'HR: create the employee’s StaffOS login (EMPLOYEE role) and email an invite',
  })
  @ApiConflictResponse({ description: 'EMPLOYEE_HAS_ACCOUNT or USER_EMAIL_EXISTS' })
  @ApiZodOkResponse(employeeSchema)
  invite(@Id() id: string, @CurrentActor() actor: Actor): Promise<Employee> {
    return this.employees.invite(id, actor);
  }
}

@ApiTags('employees')
@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('departments')
  @RequirePermissions('employees:read')
  @ApiZodOkResponse(z.array(departmentSchema))
  departments(): Promise<Department[]> {
    return this.org.departments();
  }

  @Post('departments')
  @RequirePermissions('employees:write')
  @ApiForbiddenResponse({ description: 'HR only' })
  @ApiZodBody(departmentInputSchema)
  @ApiZodOkResponse(departmentSchema)
  createDepartment(@Body() body: DepartmentDto, @CurrentActor() actor: Actor) {
    return this.org.saveDepartment(body, actor);
  }

  @Patch('departments/:id')
  @RequirePermissions('employees:write')
  @ApiZodBody(departmentInputSchema)
  @ApiZodOkResponse(departmentSchema)
  updateDepartment(@Id() id: string, @Body() body: DepartmentDto, @CurrentActor() actor: Actor) {
    return this.org.saveDepartment(body, actor, id);
  }

  @Get('positions')
  @RequirePermissions('employees:read')
  @ApiZodOkResponse(z.array(positionSchema))
  positions(): Promise<Position[]> {
    return this.org.positions();
  }

  @Post('positions')
  @RequirePermissions('employees:write')
  @ApiZodBody(positionInputSchema)
  @ApiZodOkResponse(positionSchema)
  createPosition(@Body() body: PositionDto, @CurrentActor() actor: Actor) {
    return this.org.savePosition(body, actor);
  }

  @Patch('positions/:id')
  @RequirePermissions('employees:write')
  @ApiZodBody(positionInputSchema)
  @ApiZodOkResponse(positionSchema)
  updatePosition(@Id() id: string, @Body() body: PositionDto, @CurrentActor() actor: Actor) {
    return this.org.savePosition(body, actor, id);
  }
}
