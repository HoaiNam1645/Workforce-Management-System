import {
  IsDateString,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
  ArrayUnique,
} from 'class-validator';

export const EMPLOYMENT_TYPES = ['full_time', 'part_time'] as const;
export const EMPLOYMENT_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export const EMPLOYEE_GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;

export class CreateEmployeeDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsString()
  @MaxLength(30)
  employeeCode!: string;

  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  preferredName?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsIn(EMPLOYEE_GENDERS)
  gender?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  personalEmail?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  workEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactRelationship?: string | null;

  @IsIn(EMPLOYMENT_TYPES)
  employmentType!: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus?: string;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string | null;

  @IsOptional()
  @IsString()
  terminationReason?: string | null;

  @IsUUID()
  primaryBranchId!: string;

  @IsUUID()
  departmentId!: string;

  @IsUUID()
  positionId!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  loginEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Mật khẩu phải có chữ hoa, chữ thường và chữ số' })
  password?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
