import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  Min,
} from 'class-validator';
import { Role, TemplateFieldType } from '@prisma/client';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Inspection chauffe-eau' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class CreateSectionDto {
  @ApiProperty({ example: 'Avant intervention' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: Role, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  viewRoles?: Role[];

  @ApiPropertyOptional({ enum: Role, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  editRoles?: Role[];
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}

export class CreateFieldDto {
  @ApiProperty({ example: 'Marque du chauffe-eau' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  label: string;

  @ApiProperty({ enum: TemplateFieldType, example: TemplateFieldType.TEXT })
  @IsEnum(TemplateFieldType)
  fieldType: TemplateFieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;

  @ApiPropertyOptional({ description: 'Options for SELECT field type', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'Roles allowed to view this field' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  viewRoles?: Role[];

  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'Roles allowed to edit this field' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  editRoles?: Role[];

  @ApiPropertyOptional({ enum: Role, isArray: true, description: 'Roles for which this field is required' })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  requiredRoles?: Role[];
}

export class UpdateFieldDto extends PartialType(CreateFieldDto) {}
