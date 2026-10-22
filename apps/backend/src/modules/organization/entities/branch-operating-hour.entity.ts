import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Branch } from "./branch.entity";

@Check("branch_operating_hours_day_check", "day_of_week BETWEEN 0 AND 6")
@Check(
  "branch_operating_hours_time_check",
  "is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)",
)
@Unique("branch_operating_hours_branch_day_key", ["branchId", "dayOfWeek"])
@Entity({ name: "branch_operating_hours", schema: "workforce" })
export class BranchOperatingHour {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid", { name: "branch_id" }) branchId!: string;
  @Column("smallint", { name: "day_of_week" }) dayOfWeek!: number;
  @Column("boolean", { name: "is_closed", default: false }) isClosed!: boolean;
  @Column("time", { name: "opens_at", nullable: true }) opensAt!: string | null;
  @Column("time", { name: "closes_at", nullable: true }) closesAt!:
    | string
    | null;
  @Column("boolean", { name: "spans_next_day", default: false })
  spansNextDay!: boolean;
  @Column("timestamptz", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
  @Column("timestamptz", {
    name: "updated_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt!: Date;
  @ManyToOne(() => Branch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "branch_id" })
  branch!: Branch;
}
