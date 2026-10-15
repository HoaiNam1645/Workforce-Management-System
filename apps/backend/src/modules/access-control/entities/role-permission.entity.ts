import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

@Entity({ name: 'role_permissions', schema: 'workforce' })
export class RolePermission {
  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId!: string;

  @PrimaryColumn('uuid', { name: 'permission_id' })
  permissionId!: string;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id', referencedColumnName: 'id', foreignKeyConstraintName: 'role_permissions_permission_id_fkey' })
  permission!: Permission;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id', foreignKeyConstraintName: 'role_permissions_role_id_fkey' })
  role!: Role;
}
