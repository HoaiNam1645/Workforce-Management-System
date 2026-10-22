import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const anomalyTypes = ['late', 'early_leave', 'missing_check_in', 'missing_check_out', 'absence', 'outside_geofence', 'excessive_break', 'insufficient_hours', 'outside_schedule'] as const;
export const anomalyStatuses = ['provisional', 'active', 'cleared', 'excluded'] as const;

export class AttendanceAnomalyQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(anomalyTypes) type?: typeof anomalyTypes[number];
  @IsOptional() @IsIn(anomalyStatuses) status?: typeof anomalyStatuses[number];
  @IsOptional() @IsIn(['info', 'warning', 'critical']) severity?: 'info' | 'warning' | 'critical';
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(200) pageSize = 30;
}

export class ExcludeAttendanceAnomalyDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

export class UpdateAttendanceAnomalySettingsDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(240) lateGraceMinutes!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(240) earlyLeaveGraceMinutes!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(240) insufficientToleranceMinutes!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(240) missingCheckInReminderMinutes!: number;
  @Type(() => Number) @IsInt() @Min(10) @Max(5000) maxLocationAccuracyM!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) lateCriticalMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) earlyLeaveCriticalMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) breakCriticalMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) insufficientCriticalMinutes!: number;
}
