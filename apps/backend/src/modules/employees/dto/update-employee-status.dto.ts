import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { EMPLOYMENT_STATUSES } from './create-employee.dto';

export class UpdateEmployeeStatusDto {
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus!: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string | null;

  @IsOptional()
  @IsString()
  terminationReason?: string | null;
}
