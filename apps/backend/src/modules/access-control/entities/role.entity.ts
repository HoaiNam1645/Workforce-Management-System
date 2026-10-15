import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Unique("roles_code_key", ["code"])
@Entity({ name: 'roles', schema: 'workforce' })
export class Role {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('varchar', { name: 'code', length: 50 })
  code!: string;

  @Column('varchar', { name: 'name', length: 100 })
  name!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('boolean', { name: 'is_system', default: () => "false" })
  isSystem!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;
}
