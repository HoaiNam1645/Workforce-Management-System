import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(projectDir, 'apps/backend');
dotenv.config({ path: resolve(backendDir, '.env') });

const schema = 'workforce';
const modulesDir = resolve(backendDir, 'src/modules');

const tableConfig = {
  organizations: ['core', 'Organization', 'organization'],
  users: ['access-control', 'User', 'user'],
  roles: ['access-control', 'Role', 'role'],
  permissions: ['access-control', 'Permission', 'permission'],
  role_permissions: ['access-control', 'RolePermission', 'role-permission'],
  user_roles: ['access-control', 'UserRole', 'user-role'],
  branches: ['organization', 'Branch', 'branch'],
  departments: ['organization', 'Department', 'department'],
  branch_departments: ['organization', 'BranchDepartment', 'branch-department'],
  positions: ['organization', 'Position', 'position'],
  employees: ['employees', 'Employee', 'employee'],
  employee_work_history: ['employees', 'EmployeeWorkHistory', 'employee-work-history'],
  employee_salary_rates: ['employees', 'EmployeeSalaryRate', 'employee-salary-rate'],
  employee_documents: ['employees', 'EmployeeDocument', 'employee-document'],
  shift_templates: ['schedules', 'ShiftTemplate', 'shift-template'],
  schedule_templates: ['schedules', 'ScheduleTemplate', 'schedule-template'],
  schedule_template_items: ['schedules', 'ScheduleTemplateItem', 'schedule-template-item'],
  shifts: ['schedules', 'Shift', 'shift'],
  shift_assignments: ['schedules', 'ShiftAssignment', 'shift-assignment'],
  shift_swap_requests: ['schedules', 'ShiftSwapRequest', 'shift-swap-request'],
  attendance_records: ['attendance', 'AttendanceRecord', 'attendance-record'],
  attendance_events: ['attendance', 'AttendanceEvent', 'attendance-event'],
  attendance_adjustment_requests: ['attendance', 'AttendanceAdjustmentRequest', 'attendance-adjustment-request'],
  attendance_violations: ['attendance', 'AttendanceViolation', 'attendance-violation'],
  violation_explanations: ['attendance', 'ViolationExplanation', 'violation-explanation'],
  leave_types: ['leave', 'LeaveType', 'leave-type'],
  leave_balances: ['leave', 'LeaveBalance', 'leave-balance'],
  leave_balance_transactions: ['leave', 'LeaveBalanceTransaction', 'leave-balance-transaction'],
  leave_requests: ['leave', 'LeaveRequest', 'leave-request'],
  timesheet_periods: ['timesheets', 'TimesheetPeriod', 'timesheet-period'],
  timesheets: ['timesheets', 'Timesheet', 'timesheet'],
  timesheet_entries: ['timesheets', 'TimesheetEntry', 'timesheet-entry'],
  timesheet_approval_history: ['timesheets', 'TimesheetApprovalHistory', 'timesheet-approval-history'],
  payroll_periods: ['payroll', 'PayrollPeriod', 'payroll-period'],
  employee_payrolls: ['payroll', 'EmployeePayroll', 'employee-payroll'],
  payroll_items: ['payroll', 'PayrollItem', 'payroll-item'],
  payroll_payment_history: ['payroll', 'PayrollPaymentHistory', 'payroll-payment-history'],
  labor_budgets: ['labor-costs', 'LaborBudget', 'labor-budget'],
  branch_revenues: ['labor-costs', 'BranchRevenue', 'branch-revenue'],
  tasks: ['tasks', 'Task', 'task'],
  task_assignees: ['tasks', 'TaskAssignee', 'task-assignee'],
  task_checklist_items: ['tasks', 'TaskChecklistItem', 'task-checklist-item'],
  task_comments: ['tasks', 'TaskComment', 'task-comment'],
  task_attachments: ['tasks', 'TaskAttachment', 'task-attachment'],
  policies: ['compliance', 'Policy', 'policy'],
  policy_acknowledgements: ['compliance', 'PolicyAcknowledgement', 'policy-acknowledgement'],
  notification_preferences: ['notifications', 'NotificationPreference', 'notification-preference'],
  notifications: ['notifications', 'Notification', 'notification'],
  notification_deliveries: ['notifications', 'NotificationDelivery', 'notification-delivery'],
  audit_logs: ['audit', 'AuditLog', 'audit-log'],
};

const moduleClasses = {
  core: 'CoreModule',
  'access-control': 'AccessControlModule',
  organization: 'OrganizationModule',
  employees: 'EmployeesModule',
  schedules: 'SchedulesModule',
  attendance: 'AttendanceModule',
  leave: 'LeaveModule',
  timesheets: 'TimesheetsModule',
  payroll: 'PayrollModule',
  'labor-costs': 'LaborCostsModule',
  tasks: 'TasksModule',
  compliance: 'ComplianceModule',
  notifications: 'NotificationsModule',
  audit: 'AuditModule',
};

const camelCase = (value) =>
  value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const quote = (value) => JSON.stringify(value);

const typeMap = {
  uuid: ['uuid', 'string'],
  varchar: ['varchar', 'string'],
  bpchar: ['char', 'string'],
  text: ['text', 'string'],
  date: ['date', 'string'],
  time: ['time', 'string'],
  timetz: ['time with time zone', 'string'],
  timestamp: ['timestamp', 'Date'],
  timestamptz: ['timestamptz', 'Date'],
  bool: ['boolean', 'boolean'],
  int2: ['smallint', 'number'],
  int4: ['integer', 'number'],
  int8: ['bigint', 'string'],
  numeric: ['numeric', 'string'],
  float4: ['real', 'number'],
  float8: ['double precision', 'number'],
  inet: ['inet', 'string'],
  json: ['json', 'Record<string, unknown>'],
  jsonb: ['jsonb', 'Record<string, unknown>'],
};

function relationName(columnName, foreignClass) {
  const property = camelCase(columnName);
  if (property.endsWith('Id')) return property.slice(0, -2);
  return `${property}${foreignClass}`;
}

function importPath(fromTable, toTable) {
  const [fromModule] = tableConfig[fromTable];
  const [toModule, , toFile] = tableConfig[toTable];
  if (fromModule === toModule) return `./${toFile}.entity`;
  return `../../${toModule}/entities/${toFile}.entity`;
}

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'workforce',
  password: process.env.DATABASE_PASSWORD ?? 'workforce',
  database: process.env.DATABASE_NAME ?? 'workforce',
});

const columnsResult = await pool.query(
  `SELECT table_name, column_name, udt_name, is_nullable, column_default,
          character_maximum_length, numeric_precision, numeric_scale,
          is_identity, ordinal_position
     FROM information_schema.columns
    WHERE table_schema = $1
    ORDER BY table_name, ordinal_position`,
  [schema],
);

const primaryKeysResult = await pool.query(
  `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`,
  [schema],
);

const foreignKeysResult = await pool.query(
  `SELECT tc.table_name, tc.constraint_name, kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule, rc.update_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_schema = tc.constraint_schema
      AND ccu.constraint_name = tc.constraint_name
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_schema = tc.constraint_schema
      AND rc.constraint_name = tc.constraint_name
    WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`,
  [schema],
);

const checksResult = await pool.query(
  `SELECT tbl.relname AS table_name, con.conname AS constraint_name,
          pg_get_expr(con.conbin, con.conrelid) AS expression
     FROM pg_constraint con
     JOIN pg_class tbl ON tbl.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = $1 AND con.contype = 'c'
    ORDER BY tbl.relname, con.conname`,
  [schema],
);

const uniqueConstraintsResult = await pool.query(
  `SELECT tc.table_name, tc.constraint_name,
          array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS column_names
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = $1 AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.table_name, tc.constraint_name
    ORDER BY tc.table_name, tc.constraint_name`,
  [schema],
);

const indexesResult = await pool.query(
  `SELECT tbl.relname AS table_name, idx.relname AS index_name,
          ind.indisunique, ind.indisprimary, (con.oid IS NOT NULL) AS is_constraint,
          pg_get_expr(ind.indpred, ind.indrelid) AS predicate,
          array_agg(att.attname::text ORDER BY key.ordinality) AS column_names,
          bool_and(att.attname IS NOT NULL) AS simple_columns
     FROM pg_index ind
     JOIN pg_class idx ON idx.oid = ind.indexrelid
     JOIN pg_class tbl ON tbl.oid = ind.indrelid
     JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
     CROSS JOIN LATERAL unnest(ind.indkey) WITH ORDINALITY AS key(attnum, ordinality)
     LEFT JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = key.attnum
     LEFT JOIN pg_constraint con ON con.conindid = ind.indexrelid
    WHERE ns.nspname = $1
    GROUP BY tbl.relname, idx.relname, ind.indisunique, ind.indisprimary,
             ind.indpred, ind.indrelid, con.oid
    ORDER BY tbl.relname, idx.relname`,
  [schema],
);

const columnsByTable = Map.groupBy(columnsResult.rows, (row) => row.table_name);
const primaryKeysByTable = Map.groupBy(primaryKeysResult.rows, (row) => row.table_name);
const foreignKeysByTable = Map.groupBy(foreignKeysResult.rows, (row) => row.table_name);
const checksByTable = Map.groupBy(checksResult.rows, (row) => row.table_name);
const uniqueConstraintsByTable = Map.groupBy(
  uniqueConstraintsResult.rows,
  (row) => row.table_name,
);
const indexesByTable = Map.groupBy(indexesResult.rows, (row) => row.table_name);

for (const tableName of Object.keys(tableConfig)) {
  const config = tableConfig[tableName];
  const [moduleName, className, fileName] = config;
  const columns = columnsByTable.get(tableName) ?? [];
  const primaryKeys = new Set(
    (primaryKeysByTable.get(tableName) ?? []).map((row) => row.column_name),
  );
  const foreignKeys = foreignKeysByTable.get(tableName) ?? [];
  const checks = checksByTable.get(tableName) ?? [];
  const uniqueConstraints = uniqueConstraintsByTable.get(tableName) ?? [];
  const indexes = (indexesByTable.get(tableName) ?? []).filter(
    (index) => !index.indisprimary && !index.is_constraint && index.simple_columns,
  );

  if (columns.length === 0) {
    throw new Error(`Table ${tableName} does not exist in schema ${schema}`);
  }

  const typeormImports = new Set(['Column', 'Entity']);
  if (checks.length > 0) typeormImports.add('Check');
  if (uniqueConstraints.length > 0) typeormImports.add('Unique');
  if (indexes.length > 0) typeormImports.add('Index');
  if (primaryKeys.size > 0) typeormImports.add('PrimaryColumn');
  if (foreignKeys.length > 0) {
    typeormImports.add('JoinColumn');
    typeormImports.add('ManyToOne');
  }

  const generatedUuidColumns = new Set();
  const generatedIdentityColumns = new Set();
  for (const column of columns) {
    if (!primaryKeys.has(column.column_name)) continue;
    if (column.udt_name === 'uuid' && column.column_default?.includes('gen_random_uuid')) {
      typeormImports.add('PrimaryGeneratedColumn');
      generatedUuidColumns.add(column.column_name);
    } else if (column.is_identity === 'YES') {
      typeormImports.add('PrimaryGeneratedColumn');
      generatedIdentityColumns.add(column.column_name);
    }
  }

  const entityImports = new Map();
  for (const foreignKey of foreignKeys) {
    const target = tableConfig[foreignKey.foreign_table_name];
    if (!target || foreignKey.foreign_table_name === tableName) continue;
    entityImports.set(target[1], importPath(tableName, foreignKey.foreign_table_name));
  }

  const lines = [];
  lines.push(`import { ${[...typeormImports].sort().join(', ')} } from 'typeorm';`);
  for (const [importClass, path] of [...entityImports.entries()].sort()) {
    lines.push(`import { ${importClass} } from '${path}';`);
  }
  lines.push('');

  for (const index of indexes) {
    const properties = index.column_names.map(camelCase);
    const options = [];
    if (index.indisunique) options.push('unique: true');
    if (index.predicate) options.push(`where: ${quote(index.predicate)}`);
    const optionsText = options.length > 0 ? `, { ${options.join(', ')} }` : '';
    lines.push(`@Index(${quote(index.index_name)}, ${JSON.stringify(properties)}${optionsText})`);
  }
  for (const check of checks) {
    lines.push(`@Check(${quote(check.constraint_name)}, ${quote(check.expression)})`);
  }
  for (const unique of uniqueConstraints) {
    lines.push(
      `@Unique(${quote(unique.constraint_name)}, ${JSON.stringify(unique.column_names.map(camelCase))})`,
    );
  }
  lines.push(`@Entity({ name: '${tableName}', schema: '${schema}' })`);
  lines.push(`export class ${className} {`);

  for (const column of columns) {
    const mappedType = typeMap[column.udt_name];
    if (!mappedType) throw new Error(`Unsupported PostgreSQL type: ${column.udt_name}`);
    const [databaseType, tsType] = mappedType;
    const propertyName = camelCase(column.column_name);
    const nullable = column.is_nullable === 'YES';
    const options = [`name: '${column.column_name}'`];

    if (nullable) options.push('nullable: true');
    if (column.character_maximum_length) options.push(`length: ${column.character_maximum_length}`);
    if (column.udt_name === 'numeric' && column.numeric_precision) {
      options.push(`precision: ${column.numeric_precision}`);
      options.push(`scale: ${column.numeric_scale ?? 0}`);
    }
    if (column.column_default && !generatedUuidColumns.has(column.column_name)) {
      options.push(`default: () => ${quote(column.column_default)}`);
    }

    if (generatedUuidColumns.has(column.column_name)) {
      lines.push(`  @PrimaryGeneratedColumn('uuid', { name: '${column.column_name}' })`);
    } else if (generatedIdentityColumns.has(column.column_name)) {
      lines.push(
        `  @PrimaryGeneratedColumn('increment', { name: '${column.column_name}', type: '${databaseType}' })`,
      );
    } else if (primaryKeys.has(column.column_name)) {
      lines.push(`  @PrimaryColumn('${databaseType}', { ${options.join(', ')} })`);
    } else {
      lines.push(`  @Column('${databaseType}', { ${options.join(', ')} })`);
    }
    lines.push(`  ${propertyName}!: ${tsType}${nullable ? ' | null' : ''};`);
    lines.push('');
  }

  for (const foreignKey of foreignKeys) {
    const targetConfig = tableConfig[foreignKey.foreign_table_name];
    if (!targetConfig) continue;
    const [, foreignClass] = targetConfig;
    const column = columns.find((item) => item.column_name === foreignKey.column_name);
    const nullable = column?.is_nullable === 'YES';
    const options = [];
    if (nullable) options.push('nullable: true');
    if (foreignKey.delete_rule !== 'NO ACTION') {
      options.push(`onDelete: '${foreignKey.delete_rule.replaceAll(' ', ' ')}'`);
    }
    if (foreignKey.update_rule !== 'NO ACTION') {
      options.push(`onUpdate: '${foreignKey.update_rule.replaceAll(' ', ' ')}'`);
    }
    const target = foreignKey.foreign_table_name === tableName ? className : foreignClass;
    const propertyName = relationName(foreignKey.column_name, foreignClass);
    lines.push(`  @ManyToOne(() => ${target}, { ${options.join(', ')} })`);
    lines.push(
      `  @JoinColumn({ name: '${foreignKey.column_name}', referencedColumnName: '${camelCase(foreignKey.foreign_column_name)}', foreignKeyConstraintName: '${foreignKey.constraint_name}' })`,
    );
    lines.push(`  ${propertyName}!: ${target}${nullable ? ' | null' : ''};`);
    lines.push('');
  }

  while (lines.at(-1) === '') lines.pop();
  lines.push('}', '');

  const entityDir = resolve(modulesDir, moduleName, 'entities');
  await mkdir(entityDir, { recursive: true });
  await writeFile(resolve(entityDir, `${fileName}.entity.ts`), lines.join('\n'));
}

for (const [moduleName, moduleClass] of Object.entries(moduleClasses)) {
  const entities = Object.entries(tableConfig)
    .filter(([, config]) => config[0] === moduleName)
    .map(([, config]) => ({ className: config[1], fileName: config[2] }));
  const lines = [
    "import { Module } from '@nestjs/common';",
    "import { TypeOrmModule } from '@nestjs/typeorm';",
  ];

  if (moduleName === 'employees') {
    lines.push("import { EmployeesController } from './employees.controller';");
    lines.push("import { EmployeesService } from './employees.service';");
  }
  for (const entity of entities) {
    lines.push(`import { ${entity.className} } from './entities/${entity.fileName}.entity';`);
  }
  lines.push('', 'const entities = [');
  for (const entity of entities) lines.push(`  ${entity.className},`);
  lines.push('];', '', '@Module({');
  lines.push('  imports: [TypeOrmModule.forFeature(entities)],');
  if (moduleName === 'employees') {
    lines.push('  controllers: [EmployeesController],');
    lines.push('  providers: [EmployeesService],');
    lines.push('  exports: [TypeOrmModule, EmployeesService],');
  } else {
    lines.push('  exports: [TypeOrmModule],');
  }
  lines.push('})', `export class ${moduleClass} {}`, '');

  const moduleDir = resolve(modulesDir, moduleName);
  await mkdir(moduleDir, { recursive: true });
  await writeFile(resolve(moduleDir, `${moduleName}.module.ts`), lines.join('\n'));
}

const entityExports = Object.values(tableConfig)
  .map(([moduleName, className, fileName]) =>
    `export { ${className} } from '../modules/${moduleName}/entities/${fileName}.entity';`,
  )
  .join('\n');
await mkdir(resolve(backendDir, 'src/database'), { recursive: true });
await writeFile(resolve(backendDir, 'src/database/entities.ts'), `${entityExports}\n`);

await pool.end();
console.log(`Generated ${Object.keys(tableConfig).length} entities in ${relative(projectDir, modulesDir)}.`);
