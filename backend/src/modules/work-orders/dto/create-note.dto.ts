import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({
    description: 'Contenu de la note',
    example: 'Pièce commandée — livraison prévue demain.',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
