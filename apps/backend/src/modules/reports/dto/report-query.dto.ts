import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) interval?: 'day' | 'week' | 'month';
}

export class ReportExportQueryDto extends ReportQueryDto {
  @IsIn(['csv', 'xls', 'pdf']) format!: 'csv' | 'xls' | 'pdf';
  @IsOptional() @IsIn(['overview', 'employees', 'schedule', 'hours', 'attendance', 'breaks', 'overtime', 'anomalies', 'leave', 'timesheets', 'payroll', 'branches', 'departments', 'positions', 'performance', 'plan-actual', 'period']) report?: string;
}
