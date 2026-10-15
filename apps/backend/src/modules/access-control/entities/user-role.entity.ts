import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Role } from './role.entity';
import { User } from './user.entity';

@Check("user_roles_check", "((branch_id IS NULL) OR (department_id IS NULL))")
@Unique("user_roles_user_id_role_id_branch_id_department_id_key", ["userId","roleId","branchId","departmentId"])
@Entity({ name: 'user_roles', schema: 'workforce' })
export class UserRole {
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('uuid', { name: 'role_id' })
  roleId!: string;

  @Column('uuid', { name: 'branch_id', nullable: true })
  branchId!: string | null;

  @Column('uuid', { name: 'department_id', nullable: true })
  departmentId!: string | null;

  @Column('timestamptz', { name: 'granted_at', default: () => "CURRENT_TIMESTAMP" })
  grantedAt!: Date;

  @Column('uuid', { name: 'granted_by', nullable: true })
  grantedBy!: string | null;

  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'granted_by', referencedColumnName: 'id', foreignKeyConstraintName: 'user_roles_granted_by_fkey' })
  grantedByUser!: User | null;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id', foreignKeyConstraintName: 'user_roles_role_id_fkey' })
  role!: Role;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'user_roles_branch_id_fkey' })
  branch!: Branch | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'user_roles_department_id_fkey' })
  department!: Department | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'user_roles_user_id_fkey' })
  user!: User;
}
