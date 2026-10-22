import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateShiftSwapDto {
  @IsIn(['swap', 'give_away'])
  requestType!: 'swap' | 'give_away';

  @IsUUID()
  offeredAssignmentId!: string;

  @IsUUID()
  targetEmployeeId!: string;

  @IsOptional()
  @IsUUID()
  requestedAssignmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class ShiftSwapActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ShiftSwapQueryDto {
  @IsOptional()
  @IsIn(['all', 'pending_receiver', 'pending_manager', 'approved', 'rejected_by_receiver', 'rejected_by_manager', 'cancelled', 'expired', 'invalidated'])
  status?: string;
}
