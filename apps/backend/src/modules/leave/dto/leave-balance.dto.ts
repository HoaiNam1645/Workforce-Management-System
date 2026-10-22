import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class LeaveBalanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'low', 'depleted', 'negative'])
  status?: 'all' | 'available' | 'low' | 'depleted' | 'negative';
}

export class AdjustLeaveBalanceDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  leaveTypeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  balanceYear!: number;

  @IsIn(['increase', 'decrease'])
  direction!: 'increase' | 'decrease';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  effectiveDate!: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}
