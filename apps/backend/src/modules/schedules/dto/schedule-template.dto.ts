import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class ScheduleTemplateItemDto {
  @IsUUID()
  shiftTemplateId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  dayOffset!: number;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  requiredHeadcount!: number;
}

export class CreateScheduleTemplateDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleTemplateItemDto)
  items!: ScheduleTemplateItemDto[];
}

export class ApplyScheduleTemplateDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  startDate!: string;
}

export class SaveScheduleTemplateFromRangeDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
