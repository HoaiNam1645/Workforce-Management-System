import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Department } from "./department.entity";
import { Position } from "./position.entity";

@Entity({ name: "department_positions", schema: "workforce" })
export class DepartmentPosition {
  @PrimaryColumn("uuid", { name: "department_id" }) departmentId!: string;
  @PrimaryColumn("uuid", { name: "position_id" }) positionId!: string;
  @Column("boolean", { name: "is_active", default: true }) isActive!: boolean;
  @Column("timestamptz", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
  @ManyToOne(() => Department, { onDelete: "CASCADE" })
  @JoinColumn({ name: "department_id" })
  department!: Department;
  @ManyToOne(() => Position, { onDelete: "CASCADE" })
  @JoinColumn({ name: "position_id" })
  position!: Position;
}
