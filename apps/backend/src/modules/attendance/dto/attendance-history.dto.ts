import { IsDateString, IsOptional, IsUUID, MaxLength, MinLength, IsIn, IsString, Matches } from 'class-validator';

export class AttendanceHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class LiveShiftQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày theo dõi phải có định dạng YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;
}

export class CreateAttendanceAdjustmentDto {
  @IsOptional()
  @IsUUID()
  attendanceRecordId?: string;

  @IsOptional()
  @IsUUID()
  shiftAssignmentId?: string;

  @IsOptional()
  @IsDateString()
  requestedCheckInAt?: string;

  @IsOptional()
  @IsDateString()
  requestedCheckOutAt?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class ReviewAttendanceAdjustmentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reviewNote!: string;
}
