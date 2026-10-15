import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("policies_check", "((expires_on IS NULL) OR (expires_on >= effective_on))")
@Check("policies_check1", "(((status)::text <> 'published'::text) OR (published_at IS NOT NULL))")
@Check("policies_status_check", "((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))")
@Unique("policies_organization_id_title_version_key", ["organizationId","title","version"])
@Entity({ name: 'policies', schema: 'workforce' })
export class Policy {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'title', length: 255 })
  title!: string;

  @Column('varchar', { name: 'version', length: 30 })
  version!: string;

  @Column('text', { name: 'content', nullable: true })
  content!: string | null;

  @Column('text', { name: 'file_url', nullable: true })
  fileUrl!: string | null;

  @Column('date', { name: 'effective_on' })
  effectiveOn!: string;

  @Column('date', { name: 'expires_on', nullable: true })
  expiresOn!: string | null;

  @Column('boolean', { name: 'requires_acknowledgement', default: () => "true" })
  requiresAcknowledgement!: boolean;

  @Column('varchar', { name: 'status', length: 20, default: () => "'draft'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @Column('uuid', { name: 'published_by', nullable: true })
  publishedBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'policies_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'published_by', referencedColumnName: 'id', foreignKeyConstraintName: 'policies_published_by_fkey' })
  publishedByUser!: User | null;
}
