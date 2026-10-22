import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLeaveEntitlementPolicyDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsIn(['upfront', 'monthly', 'none'])
  accrualMethod!: 'upfront' | 'monthly' | 'none';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  allowanceAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  carryoverLimit?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxBalance?: number | null;

  @IsOptional()
  @IsBoolean()
  prorateNewHires = true;

  @IsOptional()
  @IsIn(['full_time', 'part_time'])
  appliesToEmploymentType?: 'full_time' | 'part_time' | null;

  @IsOptional()
  @IsBoolean()
  isActive = true;
}

export class UpdateLeaveEntitlementPolicyDto extends PartialType(CreateLeaveEntitlementPolicyDto) {}
