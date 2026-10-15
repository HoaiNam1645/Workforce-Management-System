import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';

@Index("branches_one_head_office_idx", ["organizationId"], { unique: true, where: "((is_head_office = true) AND (deleted_at IS NULL))" })
@Check("branches_check", "((latitude IS NULL) = (longitude IS NULL))")
@Check("branches_geofence_radius_m_check", "(geofence_radius_m > 0)")
@Check("branches_latitude_check", "((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))")
@Check("branches_longitude_check", "((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))")
@Unique("branches_organization_id_code_key", ["organizationId","code"])
@Entity({ name: 'branches', schema: 'workforce' })
export class Branch {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('varchar', { name: 'email', nullable: true, length: 255 })
  email!: string | null;

  @Column('varchar', { name: 'phone', nullable: true, length: 30 })
  phone!: string | null;

  @Column('text', { name: 'address_line' })
  addressLine!: string;

  @Column('numeric', { name: 'latitude', nullable: true, precision: 10, scale: 7 })
  latitude!: string | null;

  @Column('numeric', { name: 'longitude', nullable: true, precision: 10, scale: 7 })
  longitude!: string | null;

  @Column('integer', { name: 'geofence_radius_m', default: () => "100" })
  geofenceRadiusM!: number;

  @Column('varchar', { name: 'timezone', length: 64, default: () => "'Asia/Ho_Chi_Minh'::character varying" })
  timezone!: string;

  @Column('time', { name: 'opening_time', nullable: true })
  openingTime!: string | null;

  @Column('time', { name: 'closing_time', nullable: true })
  closingTime!: string | null;

  @Column('boolean', { name: 'is_head_office', default: () => "false" })
  isHeadOffice!: boolean;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'branches_organization_id_fkey' })
  organization!: Organization;
}
