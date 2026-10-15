import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateShiftDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  unpaidBreakMinutes = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  requiredHeadcount = 1;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
