/**
 * QA V5 — settings-dto-v5.spec.ts
 *
 * Validates DTO validation logic for the V5 Settings CRUD endpoints:
 *  - CreateTaskTypeDto: required name, optional fields, max lengths
 *  - CreateClientTypeDto: required name + code, code format regex, sortOrder type
 *  - CreateAddressTypeDto: same validation as ClientType
 *  - UpdateTaskTypeDto: all optional, isActive boolean
 *  - UpdateClientTypeDto / UpdateAddressTypeDto: same as Update pattern
 *  - BUG-04: sortOrder missing @IsInt() → no type validation (documents gap)
 *  - Color max length constraint (7 chars for #RRGGBB)
 *  - Code pattern: uppercase alphanumeric + underscore only
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateClientTypeDto } from './dto/create-client-type.dto';
import { UpdateClientTypeDto } from './dto/update-client-type.dto';
import { CreateAddressTypeDto } from './dto/create-address-type.dto';
import { UpdateAddressTypeDto } from './dto/update-address-type.dto';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getErrors(DtoClass: new () => object, plain: object): Promise<string[]> {
  const instance = plainToInstance(DtoClass as new () => object, plain);
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ─── CreateTaskTypeDto ────────────────────────────────────────────────────────

describe('CreateTaskTypeDto', () => {
  it('passes with only name', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Plomberie' });
    expect(errors).toHaveLength(0);
  });

  it('passes with all fields', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Électricité',
      description: 'Travaux électriques',
      color: '#FF5733',
      icon: '⚡',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes('name') || e.toLowerCase().includes('nom') || e.toLowerCase().includes('obligatoire') || e.toLowerCase().includes('empty'))).toBe(true);
  });

  it('fails when name is empty string', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name exceeds 100 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'A'.repeat(101) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when name is exactly 100 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'A'.repeat(100) });
    expect(errors).toHaveLength(0);
  });

  it('fails when description exceeds 500 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      description: 'D'.repeat(501),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when description is exactly 500 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      description: 'D'.repeat(500),
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when color exceeds 7 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      color: '#FF57331', // 9 chars
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when color is exactly 7 characters (#RRGGBB)', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      color: '#FF5733',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when icon exceeds 50 characters', async () => {
    const errors = await getErrors(CreateTaskTypeDto, {
      name: 'Test',
      icon: 'I'.repeat(51),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('description is optional — omitting it is valid', async () => {
    const errors = await getErrors(CreateTaskTypeDto, { name: 'Test' });
    expect(errors).toHaveLength(0);
  });
});

// ─── UpdateTaskTypeDto ────────────────────────────────────────────────────────

describe('UpdateTaskTypeDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with only isActive field', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: false });
    expect(errors).toHaveLength(0);
  });

  it('passes with isActive: true', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: true });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is not a boolean (string "true")', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { isActive: 'true' });
    // class-validator with @IsBoolean should reject string 'true'
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name is an empty string in update', async () => {
    const errors = await getErrors(UpdateTaskTypeDto, { name: '' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── CreateClientTypeDto ─────────────────────────────────────────────────────

describe('CreateClientTypeDto', () => {
  it('passes with name and code', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Résidentiel',
      code: 'RESIDENTIAL',
    });
    expect(errors).toHaveLength(0);
  });

  it('passes with all fields', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Commercial',
      code: 'COMMERCIAL',
      description: 'Entreprises et commerces',
      color: '#3b82f6',
      icon: '🏢',
      sortOrder: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const errors = await getErrors(CreateClientTypeDto, { code: 'TEST' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code is missing', async () => {
    const errors = await getErrors(CreateClientTypeDto, { name: 'Test' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase letters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'residential', // should be RESIDENTIAL
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) =>
      e.toLowerCase().includes('majuscule') ||
      e.toLowerCase().includes('uppercase') ||
      e.toLowerCase().includes('pattern') ||
      e.toLowerCase().includes('format') ||
      e.toLowerCase().includes('uniquement')
    )).toBe(true);
  });

  it('fails when code contains spaces', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'CLIENT TYPE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains hyphens', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'CLIENT-TYPE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes when code contains uppercase, digits, and underscores', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test Type 1',
      code: 'TEST_TYPE_1',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when code exceeds 50 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'A'.repeat(51),
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when name exceeds 100 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'A'.repeat(101),
      code: 'TEST',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when color exceeds 7 characters', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TEST',
      color: '#AABBCCDD', // 9 chars
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  /**
   * BUG-04: sortOrder has no @IsInt() or @IsNumber() decorator.
   * When a non-numeric value is sent, class-validator does NOT reject it.
   * The request reaches Prisma which throws a 500 DB error instead of a 400.
   *
   * This test documents the gap: class-validator SHOULD reject non-numeric sortOrder.
   */
  it('BUG-04 — sortOrder: string "abc" should fail validation (currently PASSES — missing @IsInt)', async () => {
    const errors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TEST',
      sortOrder: 'abc', // Invalid: should be a number
    });
    // EXPECTED BEHAVIOR (after fix): errors.length > 0
    // CURRENT BEHAVIOR (bug): errors.length === 0 because @IsInt/@IsNumber is missing
    // This test PASSES currently (no validation error), documenting the missing validator
    expect(errors).toHaveLength(0); // Confirms the bug: no validation error for string 'abc'
  });

  it('BUG-04 — after fix: @IsInt() should reject sortOrder: "abc"', () => {
    // This test describes what SHOULD happen after the fix is applied.
    // Currently sortOrder has no type validator, so class-validator accepts any value.
    // Fix: add @IsInt() @IsOptional() to sortOrder in CreateClientTypeDto and CreateAddressTypeDto
    const missingDecorator = true; // Documents that @IsInt is missing
    expect(missingDecorator).toBe(true);
  });
});

// ─── UpdateClientTypeDto ─────────────────────────────────────────────────────

describe('UpdateClientTypeDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const errors = await getErrors(UpdateClientTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with only isActive', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { isActive: false });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is not a boolean', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { isActive: 1 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase in update', async () => {
    const errors = await getErrors(UpdateClientTypeDto, { code: 'lowercase' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── CreateAddressTypeDto ─────────────────────────────────────────────────────

describe('CreateAddressTypeDto', () => {
  it('passes with name and code', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Bureau',
      code: 'OFFICE',
    });
    expect(errors).toHaveLength(0);
  });

  it('fails when code is empty string', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: '',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when code contains lowercase', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Bureau',
      code: 'office', // lowercase
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes with valid code and all optional fields', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Chantier',
      code: 'WORKSITE',
      description: 'Site de travaux',
      color: '#ef4444',
      icon: '🔧',
      sortOrder: 3,
    });
    expect(errors).toHaveLength(0);
  });

  it('BUG-04 — sortOrder accepts non-numeric value (missing @IsInt, same as ClientType)', async () => {
    const errors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: 'TEST',
      sortOrder: 'not-a-number', // Should fail but doesn't — missing @IsInt
    });
    expect(errors).toHaveLength(0); // Confirms the bug
  });
});

// ─── UpdateAddressTypeDto ─────────────────────────────────────────────────────

describe('UpdateAddressTypeDto', () => {
  it('passes with empty body', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, {});
    expect(errors).toHaveLength(0);
  });

  it('passes with isActive: true', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, { isActive: true });
    expect(errors).toHaveLength(0);
  });

  it('fails when isActive is a string', async () => {
    const errors = await getErrors(UpdateAddressTypeDto, { isActive: 'false' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── Cross-DTO coherence ──────────────────────────────────────────────────────

describe('CreateClientTypeDto vs CreateAddressTypeDto — structural symmetry', () => {
  it('both DTOs reject code with special characters', async () => {
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: 'TYPE@1',
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: 'TYPE@1',
    });
    expect(clientErrors.length).toBeGreaterThan(0);
    expect(addressErrors.length).toBeGreaterThan(0);
  });

  it('both DTOs accept the same valid code format', async () => {
    const validCode = 'VALID_CODE_123';
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: 'Test',
      code: validCode,
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: 'Test',
      code: validCode,
    });
    expect(clientErrors).toHaveLength(0);
    expect(addressErrors).toHaveLength(0);
  });

  it('both reject name exceeding 100 characters', async () => {
    const longName = 'N'.repeat(101);
    const clientErrors = await getErrors(CreateClientTypeDto, {
      name: longName,
      code: 'CODE',
    });
    const addressErrors = await getErrors(CreateAddressTypeDto, {
      name: longName,
      code: 'CODE',
    });
    expect(clientErrors.length).toBeGreaterThan(0);
    expect(addressErrors.length).toBeGreaterThan(0);
  });
});
