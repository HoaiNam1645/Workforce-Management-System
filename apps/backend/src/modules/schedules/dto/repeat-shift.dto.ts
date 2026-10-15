import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, Max, Min } from 'class-validator';

export class RepeatShiftDto {
  @IsIn(['daily', 'weekly'])
  frequency!: 'daily' | 'weekly';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  occurrences!: number;

  @IsDateString()
  until!: string;
}
