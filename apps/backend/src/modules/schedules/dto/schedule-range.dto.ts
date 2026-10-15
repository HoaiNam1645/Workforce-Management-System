import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ScheduleRangeDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class PublishScheduleDto extends ScheduleRangeDto {
  @IsOptional()
  @IsBoolean()
  allowUnderstaffed = false;
}
