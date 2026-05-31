import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'jean.dupont@taskmgr.local' })
  email: string;

  @ApiProperty({ example: 'Jean' })
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  lastName: string;

  @ApiProperty({ enum: Role, example: Role.TECHNICIAN })
  role: Role;

  @ApiProperty({ example: true, description: 'false = soft-deleted' })
  isActive: boolean;

  @ApiPropertyOptional({ example: '+33612345678', nullable: true })
  phone: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
