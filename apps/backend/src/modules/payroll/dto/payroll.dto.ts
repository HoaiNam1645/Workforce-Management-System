import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PayrollListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['draft', 'calculating', 'needs_review', 'pending_approval', 'approved', 'returned', 'locked', 'partially_paid', 'paid', 'cancelled']) status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class CreateSalaryRateDto {
  @IsUUID() employeeId!: string;
  @IsIn(['hourly', 'monthly']) payType!: 'hourly' | 'monthly';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) baseRate!: number;
  @IsOptional() @IsString() @Length(3, 3) currencyCode?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CreatePayrollRuleDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['overtime', 'holiday', 'allowance']) ruleType!: 'overtime' | 'holiday' | 'allowance';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) multiplier!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) fixedAmount?: number | null;
  @IsOptional() @IsString() @MaxLength(30) dayType?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) priority?: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
}

export class UpdatePayrollRuleDto extends CreatePayrollRuleDto {}

export class CreatePayrollPeriodDto {
  @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsOptional() @IsDateString() paymentDate?: string | null;
}

export class PayrollActionDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreatePayrollItemDto {
  @IsIn(['earning', 'allowance', 'bonus', 'deduction']) itemType!: 'earning' | 'allowance' | 'bonus' | 'deduction';
  @IsString() @MinLength(2) @MaxLength(50) code!: string;
  @IsString() @MinLength(2) @MaxLength(255) description!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) rate?: number | null;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsDateString() workDate?: string | null;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class RecordPayrollPaymentDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsDateString() paidAt!: string;
  @IsString() @MinLength(2) @MaxLength(30) paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReversePayrollPaymentDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
