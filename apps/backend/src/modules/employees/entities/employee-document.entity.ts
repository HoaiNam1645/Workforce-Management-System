import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from './employee.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("employee_documents_check", "((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on))")
@Check("employee_documents_document_type_check", "((document_type)::text = ANY ((ARRAY['contract'::character varying, 'identity'::character varying, 'certificate'::character varying, 'license'::character varying, 'other'::character varying])::text[]))")
@Check("employee_documents_status_check", "((status)::text = ANY ((ARRAY['valid'::character varying, 'expired'::character varying, 'revoked'::character varying])::text[]))")
@Entity({ name: 'employee_documents', schema: 'workforce' })
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('varchar', { name: 'document_type', length: 30 })
  documentType!: string;

  @Column('varchar', { name: 'title', length: 200 })
  title!: string;

  @Column('varchar', { name: 'document_number', nullable: true, length: 100 })
  documentNumber!: string | null;

  @Column('date', { name: 'issued_on', nullable: true })
  issuedOn!: string | null;

  @Column('date', { name: 'expires_on', nullable: true })
  expiresOn!: string | null;

  @Column('text', { name: 'file_url' })
  fileUrl!: string;

  @Column('boolean', { name: 'is_confidential', default: () => "true" })
  isConfidential!: boolean;

  @Column('varchar', { name: 'status', length: 20, default: () => "'valid'::character varying" })
  status!: string;

  @Column('uuid', { name: 'uploaded_by', nullable: true })
  uploadedBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_documents_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_documents_uploaded_by_fkey' })
  uploadedByUser!: User | null;
}
