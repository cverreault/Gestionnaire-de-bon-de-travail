import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { TemplatesService } from './templates.service';
import {
  CreateFieldDto,
  CreateSectionDto,
  CreateTemplateDto,
  UpdateFieldDto,
  UpdateSectionDto,
  UpdateTemplateDto,
} from './dto/template.dto';

@ApiTags('Templates')
@ApiBearerAuth('access-token')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // ── Templates ────────────────────────────────────────────────────────────
  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.templatesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  @Post(':id/sections')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  addSection(@Param('id') id: string, @Body() dto: CreateSectionDto) {
    return this.templatesService.addSection(id, dto);
  }

  @Patch(':id/sections/:sectionId')
  @Roles(Role.ADMIN)
  updateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.templatesService.updateSection(id, sectionId, dto);
  }

  @Delete(':id/sections/:sectionId')
  @Roles(Role.ADMIN)
  removeSection(@Param('id') id: string, @Param('sectionId') sectionId: string) {
    return this.templatesService.removeSection(id, sectionId);
  }

  // ── Fields ───────────────────────────────────────────────────────────────
  @Post(':id/sections/:sectionId/fields')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  addField(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.templatesService.addField(id, sectionId, dto);
  }

  @Patch(':id/sections/:sectionId/fields/:fieldId')
  @Roles(Role.ADMIN)
  updateField(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.templatesService.updateField(id, sectionId, fieldId, dto);
  }

  @Delete(':id/sections/:sectionId/fields/:fieldId')
  @Roles(Role.ADMIN)
  removeField(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.templatesService.removeField(id, sectionId, fieldId);
  }
}
