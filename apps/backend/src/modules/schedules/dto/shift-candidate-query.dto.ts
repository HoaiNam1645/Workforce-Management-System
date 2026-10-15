import { IsOptional, IsString } from 'class-validator';

export class ShiftCandidateQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
