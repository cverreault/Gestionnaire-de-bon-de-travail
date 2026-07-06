import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TemplateFieldType } from '@prisma/client';

export class CreateAddressTypeFieldDto {
  @ApiProperty({
    example: 'N° de terrain',
    description: 'Legacy — écris de préférence labelFr + labelEn.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  label: string;

  @ApiPropertyOptional({ description: 'Libellé en français (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  labelFr?: string;

  @ApiPropertyOptional({ description: 'Libellé en anglais (B10.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  labelEn?: string;

  @ApiProperty({ enum: TemplateFieldType, example: TemplateFieldType.TEXT })
  @IsEnum(TemplateFieldType)
  fieldType: TemplateFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Options for SELECT/MULTISELECT/RADIO', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAddressTypeFieldDto extends PartialType(CreateAddressTypeFieldDto) {}
