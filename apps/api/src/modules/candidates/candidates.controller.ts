import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  type Candidate,
  candidateCreateSchema,
  candidateListQuerySchema,
  candidateSchema,
  candidateUpdateSchema,
  type Paginated,
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
import { CandidatesService } from './candidates.service';

class ListQueryDto extends createZodDto(candidateListQuerySchema) {}
class CreateDto extends createZodDto(candidateCreateSchema) {}
class UpdateDto extends createZodDto(candidateUpdateSchema) {}
class ForceQueryDto extends createZodDto(
  z.strictObject({ force: z.enum(['true', 'false']).optional() }),
) {}

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('candidates')
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @RequirePermissions('candidates:read')
  @ApiListQuery(['source'])
  @ApiZodOkResponse(z.object({ data: z.array(candidateSchema) }))
  list(@Query() query: ListQueryDto, @CurrentActor() actor: Actor): Promise<Paginated<Candidate>> {
    return this.candidates.list(query, actor);
  }

  @Post()
  @RequirePermissions('candidates:write')
  @ApiOperation({ summary: 'Create a candidate (409 CANDIDATE_DUPLICATE on same email/phone)' })
  @ApiQuery({
    name: 'force',
    required: false,
    description: 'HR Manager only: create despite a duplicate',
  })
  @ApiZodBody(candidateCreateSchema)
  @ApiZodOkResponse(candidateSchema)
  create(
    @Body() body: CreateDto,
    @Query() query: ForceQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<Candidate> {
    return this.candidates.create(body, query.force === 'true', actor);
  }

  @Get(':id')
  @RequirePermissions('candidates:read')
  @ApiZodOkResponse(candidateSchema)
  get(@Id() id: string, @CurrentActor() actor: Actor): Promise<Candidate> {
    return this.candidates.get(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('candidates:write')
  @ApiZodBody(candidateUpdateSchema)
  @ApiZodOkResponse(candidateSchema)
  update(
    @Id() id: string,
    @Body() body: UpdateDto,
    @CurrentActor() actor: Actor,
  ): Promise<Candidate> {
    return this.candidates.update(id, body, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('candidates:write')
  @ApiOperation({ summary: 'Soft delete (HR Manager only)' })
  remove(@Id() id: string, @CurrentActor() actor: Actor): Promise<void> {
    return this.candidates.remove(id, actor);
  }
}
