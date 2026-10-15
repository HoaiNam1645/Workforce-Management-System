import { Check, Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Index("users_phone_active_uq", ["phone"], { unique: true, where: "((phone IS NOT NULL) AND (deleted_at IS NULL))" })
@Check("users_failed_login_count_check", "(failed_login_count >= 0)")
@Check("users_status_check", "((status)::text = ANY ((ARRAY['invited'::character varying, 'active'::character varying, 'locked'::character varying, 'disabled'::character varying])::text[]))")
@Entity({ name: 'users', schema: 'workforce' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('varchar', { name: 'email', length: 255 })
  email!: string;

  @Column('varchar', { name: 'phone', nullable: true, length: 30 })
  phone!: string | null;

  @Column('text', { name: 'password_hash' })
  passwordHash!: string;

  @Column('varchar', { name: 'display_name', length: 150 })
  displayName!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'active'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null;

  @Column('timestamptz', { name: 'password_changed_at', nullable: true })
  passwordChangedAt!: Date | null;

  @Column('integer', { name: 'failed_login_count', default: () => "0" })
  failedLoginCount!: number;

  @Column('timestamptz', { name: 'locked_until', nullable: true })
  lockedUntil!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
