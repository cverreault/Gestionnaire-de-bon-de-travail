import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({
    description: 'Terme de recherche (min 2 caractères, max 100)',
    example: 'Dupont',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'La recherche doit faire au moins 2 caractères' })
  @MaxLength(100)
  q!: string;
}
