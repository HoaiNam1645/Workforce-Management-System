import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsBooleanString, IsHexColor, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, Matches } from 'class-validator';

export class LeaveTypeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status?: 'all' | 'active' | 'inactive';

  @IsOptional()
  @IsIn(['all', 'paid', 'unpaid'])
  payType?: 'all' | 'paid' | 'unpaid';

  @IsOptional()
  @IsBooleanString()
  tracksBalance?: string;
}

export class CreateLeaveTypeDto {
  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsHexColor()
  color = '#2563EB';

  @IsBoolean()
  isPaid!: boolean;

  @IsIn(['day', 'hour', 'both'])
  unit!: 'day' | 'hour' | 'both';

  @IsBoolean()
  tracksBalance!: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegativeBalance = false;

  @IsOptional()
  @IsBoolean()
  requiresAttachment = false;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  attachmentRequiredAfter?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(24)
  hoursPerDay = 8;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([15, 30, 60])
  hourIncrementMinutes = 30;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  minNoticeDays = 0;

  @IsOptional()
  @IsBoolean()
  allowRetroactive = false;

  @IsOptional()
  @IsBoolean()
  requiresApproval = true;

  @IsOptional()
  @IsBoolean()
  isActive = true;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {}

export class UpdateLeaveTypeStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
