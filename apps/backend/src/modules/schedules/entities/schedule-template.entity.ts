import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'schedule_templates', schema: 'workforce' })
export class ScheduleTemplate {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_templates_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_templates_created_by_fkey' })
  createdByUser!: User | null;
}
