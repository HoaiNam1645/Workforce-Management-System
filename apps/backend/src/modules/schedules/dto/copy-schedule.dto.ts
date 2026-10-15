import { Type } from 'class-transformer';
import { IsDateString, IsInt, Max, Min } from 'class-validator';

export class CopyScheduleDto {
  @IsDateString()
  sourceFrom!: string;

  @IsDateString()
  sourceTo!: string;

  @IsDateString()
  targetStart!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxShifts = 200;
}
