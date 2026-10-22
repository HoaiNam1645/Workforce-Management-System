import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Branch } from "./branch.entity";
import { Department } from "./department.entity";

@Entity({ name: "branch_departments", schema: "workforce" })
export class BranchDepartment {
  @PrimaryColumn("uuid", { name: "branch_id" })
  branchId!: string;

  @PrimaryColumn("uuid", { name: "department_id" })
  departmentId!: string;

  @Column("boolean", { name: "is_active", default: () => "true" })
  isActive!: boolean;

  @Column("date", { name: "effective_from", default: () => "CURRENT_DATE" })
  effectiveFrom!: string;

  @Column("date", { name: "effective_to", nullable: true })
  effectiveTo!: string | null;

  @Column("timestamptz", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @ManyToOne(() => Department, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "department_id",
    referencedColumnName: "id",
    foreignKeyConstraintName: "branch_departments_department_id_fkey",
  })
  department!: Department;

  @ManyToOne(() => Branch, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "branch_id",
    referencedColumnName: "id",
    foreignKeyConstraintName: "branch_departments_branch_id_fkey",
  })
  branch!: Branch;
}
