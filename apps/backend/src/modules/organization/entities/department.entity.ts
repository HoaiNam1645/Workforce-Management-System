import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';

@Check("departments_check", "((parent_id IS NULL) OR (parent_id <> id))")
@Unique("departments_organization_id_code_key", ["organizationId","code"])
@Entity({ name: 'departments', schema: 'workforce' })
export class Department {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('uuid', { name: 'parent_id', nullable: true })
  parentId!: string | null;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'parent_id', referencedColumnName: 'id', foreignKeyConstraintName: 'departments_parent_id_fkey' })
  parent!: Department | null;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'departments_organization_id_fkey' })
  organization!: Organization;
}
