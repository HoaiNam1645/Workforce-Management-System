import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Unique("permissions_code_key", ["code"])
@Unique("permissions_module_action_key", ["module","action"])
@Entity({ name: 'permissions', schema: 'workforce' })
export class Permission {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('varchar', { name: 'code', length: 100 })
  code!: string;

  @Column('varchar', { name: 'module', length: 50 })
  module!: string;

  @Column('varchar', { name: 'action', length: 30 })
  action!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;
}
