import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AssignEmployeesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @IsOptional()
  @IsBoolean()
  allowDepartmentOrPositionMismatch = false;
}
