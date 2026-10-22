import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';

@Check('attendance_anomaly_settings_values_check', 'late_grace_minutes >= 0 AND early_leave_grace_minutes >= 0 AND insufficient_tolerance_minutes >= 0 AND max_location_accuracy_m > 0')
@Unique('attendance_anomaly_settings_organization_key', ['organizationId'])
@Entity({ name: 'attendance_anomaly_settings', schema: 'workforce' })
export class AttendanceAnomalySetting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('smallint', { name: 'late_grace_minutes', default: () => '15' })
  lateGraceMinutes!: number;

  @Column('smallint', { name: 'early_leave_grace_minutes', default: () => '0' })
  earlyLeaveGraceMinutes!: number;

  @Column('smallint', { name: 'insufficient_tolerance_minutes', default: () => '0' })
  insufficientToleranceMinutes!: number;

  @Column('smallint', { name: 'missing_check_in_reminder_minutes', default: () => '15' })
  missingCheckInReminderMinutes!: number;

  @Column('integer', { name: 'max_location_accuracy_m', default: () => '100' })
  maxLocationAccuracyM!: number;

  @Column('smallint', { name: 'late_critical_minutes', default: () => '60' })
  lateCriticalMinutes!: number;

  @Column('smallint', { name: 'early_leave_critical_minutes', default: () => '60' })
  earlyLeaveCriticalMinutes!: number;

  @Column('smallint', { name: 'break_critical_minutes', default: () => '30' })
  breakCriticalMinutes!: number;

  @Column('smallint', { name: 'insufficient_critical_minutes', default: () => '60' })
  insufficientCriticalMinutes!: number;

  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_anomaly_settings_organization_id_fkey' })
  organization!: Organization;
}
