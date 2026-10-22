import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Branch } from "./branch.entity";

@Unique("branch_operating_exceptions_branch_date_key", [
  "branchId",
  "exceptionDate",
])
@Entity({ name: "branch_operating_exceptions", schema: "workforce" })
export class BranchOperatingException {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column("uuid", { name: "branch_id" }) branchId!: string;
  @Column("date", { name: "exception_date" }) exceptionDate!: string;
  @Column("boolean", { name: "is_closed", default: true }) isClosed!: boolean;
  @Column("time", { name: "opens_at", nullable: true }) opensAt!: string | null;
  @Column("time", { name: "closes_at", nullable: true }) closesAt!:
    | string
    | null;
  @Column("boolean", { name: "spans_next_day", default: false })
  spansNextDay!: boolean;
  @Column("varchar", { name: "name", length: 150 }) name!: string;
  @Column("text", { name: "note", nullable: true }) note!: string | null;
  @Column("timestamptz", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
  @ManyToOne(() => Branch, { onDelete: "CASCADE" })
  @JoinColumn({ name: "branch_id" })
  branch!: Branch;
}
