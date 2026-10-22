import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GenerateTimesheetsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class AdjustTimesheetDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  sourceKey!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  breakMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  regularMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  overtimeMinutes!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class TimesheetActionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class BulkTimesheetActionDto extends TimesheetActionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  timesheetIds!: string[];
}
