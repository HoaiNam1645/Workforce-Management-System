import { IsDateString, IsIn, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsIn(['full_day', 'half_day', 'hourly'])
  requestMode!: 'full_day' | 'half_day' | 'hourly';

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(['first_half', 'second_half'])
  dayPart?: 'first_half' | 'second_half' | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string | null;

  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  attachmentUrl?: string | null;
}
