import { Check, Column, Entity, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Check("organizations_attendance_rounding_minutes_check", "((attendance_rounding_minutes >= 1) AND (attendance_rounding_minutes <= 60))")
@Check("organizations_early_leave_grace_minutes_check", "(early_leave_grace_minutes >= 0)")
@Check("organizations_late_grace_minutes_check", "(late_grace_minutes >= 0)")
@Check("organizations_week_starts_on_check", "((week_starts_on >= 0) AND (week_starts_on <= 6))")
@Unique("organizations_code_key", ["code"])
@Entity({ name: 'organizations', schema: 'workforce' })
export class Organization {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 200 })
  name!: string;

  @Column('varchar', { name: 'legal_name', nullable: true, length: 255 })
  legalName!: string | null;

  @Column('varchar', { name: 'tax_code', nullable: true, length: 50 })
  taxCode!: string | null;

  @Column('varchar', { name: 'email', nullable: true, length: 255 })
  email!: string | null;

  @Column('varchar', { name: 'phone', nullable: true, length: 30 })
  phone!: string | null;

  @Column('text', { name: 'address', nullable: true })
  address!: string | null;

  @Column('varchar', { name: 'timezone', length: 64, default: () => "'Asia/Ho_Chi_Minh'::character varying" })
  timezone!: string;

  @Column('char', { name: 'currency_code', length: 3, default: () => "'VND'::bpchar" })
  currencyCode!: string;

  @Column('smallint', { name: 'week_starts_on', default: () => "1" })
  weekStartsOn!: number;

  @Column('smallint', { name: 'attendance_rounding_minutes', default: () => "1" })
  attendanceRoundingMinutes!: number;

  @Column('smallint', { name: 'late_grace_minutes', default: () => "0" })
  lateGraceMinutes!: number;

  @Column('smallint', { name: 'early_leave_grace_minutes', default: () => "0" })
  earlyLeaveGraceMinutes!: number;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;
}
