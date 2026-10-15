import { Type } from 'class-transformer';
import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateShiftTemplateDto {
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsHexColor()
  color = '#2563EB';

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  crossesMidnight = false;

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
}
