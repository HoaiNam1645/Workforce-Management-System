import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../access-control/entities/user.entity";
import { Employee } from "../../employees/entities/employee.entity";
import { Branch } from "./branch.entity";

@Check(
  "branch_manager_assignment_dates_check",
  "effective_to IS NULL OR effective_to >= effective_from",
)
@Entity({ name: "branch_manager_assignments", schema: "workforce" })
export class BranchManagerAssignment {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid", { name: "branch_id" }) branchId!: string;
  @Column("uuid", { name: "employee_id" }) employeeId!: string;
  @Column("varchar", {
    name: "responsibility",
    length: 120,
    default: "Quản lý chi nhánh",
  })
  responsibility!: string;
  @Column("boolean", { name: "is_primary", default: false })
  isPrimary!: boolean;
  @Column("date", { name: "effective_from" }) effectiveFrom!: string;
  @Column("date", { name: "effective_to", nullable: true }) effectiveTo!:
    | string
    | null;
  @Column("uuid", { name: "created_by", nullable: true }) createdBy!:
    | string
    | null;
  @Column("timestamptz", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
  @ManyToOne(() => Branch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "branch_id" })
  branch!: Branch;
  @ManyToOne(() => Employee)
  @JoinColumn({ name: "employee_id" })
  employee!: Employee;
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "created_by" })
  createdByUser!: User | null;
}
