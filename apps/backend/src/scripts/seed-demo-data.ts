import { hash } from 'bcryptjs';
import { EntityManager, IsNull } from 'typeorm';
import dataSource from '../database/data-source';
import { Role } from '../modules/access-control/entities/role.entity';
import { UserRole } from '../modules/access-control/entities/user-role.entity';
import { User } from '../modules/access-control/entities/user.entity';
import { AttendanceEvent } from '../modules/attendance/entities/attendance-event.entity';
import { AttendanceRecord } from '../modules/attendance/entities/attendance-record.entity';
import { AttendanceViolation } from '../modules/attendance/entities/attendance-violation.entity';
import { Organization } from '../modules/core/entities/organization.entity';
import { EmployeeSalaryRate } from '../modules/employees/entities/employee-salary-rate.entity';
import { EmployeeWorkHistory } from '../modules/employees/entities/employee-work-history.entity';
import { Employee } from '../modules/employees/entities/employee.entity';
import { BranchDepartment } from '../modules/organization/entities/branch-department.entity';
import { Branch } from '../modules/organization/entities/branch.entity';
import { Department } from '../modules/organization/entities/department.entity';
import { Position } from '../modules/organization/entities/position.entity';
import { LeaveBalanceTransaction } from '../modules/leave/entities/leave-balance-transaction.entity';
import { LeaveBalance } from '../modules/leave/entities/leave-balance.entity';
import { LeaveEntitlementPolicy } from '../modules/leave/entities/leave-entitlement-policy.entity';
import { LeaveRequest } from '../modules/leave/entities/leave-request.entity';
import { LeaveType } from '../modules/leave/entities/leave-type.entity';
import { ShiftAssignment } from '../modules/schedules/entities/shift-assignment.entity';
import { ShiftTemplate } from '../modules/schedules/entities/shift-template.entity';
import { Shift } from '../modules/schedules/entities/shift.entity';

const DEFAULT_PASSWORD = 'Demo@12345678';
const TIMEZONE_OFFSET = '+07:00';
const DEMO_MARKER = 'DEMO_SEED_V1';

type SeedPerson = {
  code: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'HR' | 'MANAGER' | 'PAYROLL' | 'EMPLOYEE';
  branchCode: 'HQ' | 'HCM';
  departmentCode: 'OPERATIONS' | 'HR' | 'FINANCE';
  positionCode: 'DIRECTOR' | 'OPS_MANAGER' | 'OPERATIONS_STAFF' | 'HR_SPECIALIST' | 'PAYROLL_SPECIALIST';
  employmentType: 'full_time' | 'part_time';
  salaryType: 'monthly' | 'hourly';
  salary: string;
};

type AttendanceScenario = {
  checkIn?: string;
  breakStart?: string;
  breakEnd?: string;
  checkOut?: string;
  status: 'completed' | 'missing_check_in' | 'missing_check_out' | 'absent';
  violation?: {
    type: 'late' | 'early_leave' | 'missing_check_in' | 'missing_check_out' | 'absence' | 'excessive_break';
    minutes: number;
    severity?: 'warning' | 'critical';
    details: string;
  };
};

const people: SeedPerson[] = [
  { code: 'LMX-ADM-001', email: 'admin@lemiex.vn', firstName: 'Minh', lastName: 'Nguyễn', role: 'ADMIN', branchCode: 'HQ', departmentCode: 'OPERATIONS', positionCode: 'DIRECTOR', employmentType: 'full_time', salaryType: 'monthly', salary: '35000000' },
  { code: 'LMX-HR-001', email: 'hr@lemiex.vn', firstName: 'Hương', lastName: 'Trần', role: 'HR', branchCode: 'HQ', departmentCode: 'HR', positionCode: 'HR_SPECIALIST', employmentType: 'full_time', salaryType: 'monthly', salary: '18000000' },
  { code: 'LMX-MGR-001', email: 'manager@lemiex.vn', firstName: 'Quang', lastName: 'Lê', role: 'MANAGER', branchCode: 'HQ', departmentCode: 'OPERATIONS', positionCode: 'OPS_MANAGER', employmentType: 'full_time', salaryType: 'monthly', salary: '24000000' },
  { code: 'LMX-PAY-001', email: 'payroll@lemiex.vn', firstName: 'Thảo', lastName: 'Phạm', role: 'PAYROLL', branchCode: 'HQ', departmentCode: 'FINANCE', positionCode: 'PAYROLL_SPECIALIST', employmentType: 'full_time', salaryType: 'monthly', salary: '20000000' },
  { code: 'LMX-NV-001', email: 'an.nguyen@lemiex.vn', firstName: 'An', lastName: 'Nguyễn', role: 'EMPLOYEE', branchCode: 'HQ', departmentCode: 'OPERATIONS', positionCode: 'OPERATIONS_STAFF', employmentType: 'full_time', salaryType: 'monthly', salary: '12000000' },
  { code: 'LMX-NV-002', email: 'binh.tran@lemiex.vn', firstName: 'Bình', lastName: 'Trần', role: 'EMPLOYEE', branchCode: 'HQ', departmentCode: 'OPERATIONS', positionCode: 'OPERATIONS_STAFF', employmentType: 'full_time', salaryType: 'monthly', salary: '12500000' },
  { code: 'LMX-NV-003', email: 'chi.le@lemiex.vn', firstName: 'Chi', lastName: 'Lê', role: 'EMPLOYEE', branchCode: 'HCM', departmentCode: 'OPERATIONS', positionCode: 'OPERATIONS_STAFF', employmentType: 'part_time', salaryType: 'hourly', salary: '65000' },
  { code: 'LMX-NV-004', email: 'dung.pham@lemiex.vn', firstName: 'Dũng', lastName: 'Phạm', role: 'EMPLOYEE', branchCode: 'HCM', departmentCode: 'OPERATIONS', positionCode: 'OPERATIONS_STAFF', employmentType: 'full_time', salaryType: 'monthly', salary: '13000000' },
];

const workDates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16'];

function at(date: string, time: string) {
  return new Date(`${date}T${time}:00${TIMEZONE_OFFSET}`);
}

function minutesBetween(from?: string, to?: string) {
  if (!from || !to) return 0;
  const [fromHour, fromMinute] = from.split(':').map(Number);
  const [toHour, toMinute] = to.split(':').map(Number);
  return Math.max((toHour * 60 + toMinute) - (fromHour * 60 + fromMinute), 0);
}

function scenarioFor(employeeCode: string, date: string): AttendanceScenario {
  if (employeeCode === 'LMX-NV-001' && date === '2026-10-06') {
    return { checkIn: '08:25', breakStart: '12:00', breakEnd: '13:00', checkOut: '17:00', status: 'completed', violation: { type: 'late', minutes: 25, details: 'Check-in muộn 25 phút, vượt ngưỡng cảnh báo 15 phút.' } };
  }
  if (employeeCode === 'LMX-NV-002' && date === '2026-10-07') {
    return { checkIn: '08:00', breakStart: '12:00', breakEnd: '13:00', checkOut: '16:30', status: 'completed', violation: { type: 'early_leave', minutes: 30, details: 'Check-out sớm 30 phút so với lịch phân ca.' } };
  }
  if (employeeCode === 'LMX-NV-003' && date === '2026-10-08') {
    return { checkIn: '08:00', breakStart: '12:00', breakEnd: '13:30', checkOut: '17:00', status: 'completed', violation: { type: 'excessive_break', minutes: 30, details: 'Thời gian nghỉ 90 phút, vượt thời lượng cho phép 30 phút.' } };
  }
  if (employeeCode === 'LMX-NV-004' && date === '2026-10-09') {
    return { checkIn: '08:00', breakStart: '12:00', breakEnd: '13:00', checkOut: '19:00', status: 'completed' };
  }
  if (employeeCode === 'LMX-NV-001' && date === '2026-10-12') {
    return { checkIn: '08:00', breakStart: '12:00', breakEnd: '13:00', status: 'missing_check_out', violation: { type: 'missing_check_out', minutes: 0, severity: 'critical', details: 'Hết ngày làm việc nhưng nhân viên chưa check-out.' } };
  }
  if (employeeCode === 'LMX-NV-002' && date === '2026-10-13') {
    return { status: 'absent', violation: { type: 'absence', minutes: 480, severity: 'critical', details: 'Không có dữ liệu chấm công trong ca đã được phân.' } };
  }
  if (employeeCode === 'LMX-NV-004' && date === '2026-10-16') {
    return { checkOut: '17:00', status: 'missing_check_in', violation: { type: 'missing_check_in', minutes: 0, severity: 'critical', details: 'Có check-out nhưng không ghi nhận check-in trong ca.' } };
  }
  return { checkIn: '08:00', breakStart: '12:00', breakEnd: '13:00', checkOut: '17:00', status: 'completed' };
}

async function ensureOrganization(manager: EntityManager) {
  const repository = manager.getRepository(Organization);
  let organization = await repository.findOneBy({ code: 'LEMIEX' });
  if (!organization) {
    organization = repository.create({
      code: 'LEMIEX',
      name: 'Lemiex',
      legalName: 'Công ty Lemiex',
      taxCode: null,
      email: 'contact@lemiex.vn',
      phone: '0905000000',
      address: '07 Hóa Sơn 10, Đà Nẵng',
      timezone: 'Asia/Ho_Chi_Minh',
      currencyCode: 'VND',
      weekStartsOn: 1,
      attendanceRoundingMinutes: 1,
      lateGraceMinutes: 15,
      earlyLeaveGraceMinutes: 0,
    });
  } else {
    organization.name = 'Lemiex';
    organization.timezone = 'Asia/Ho_Chi_Minh';
    organization.currencyCode = 'VND';
    organization.weekStartsOn = 1;
    organization.lateGraceMinutes = 15;
    organization.updatedAt = new Date();
  }
  return repository.save(organization);
}

async function ensureBranch(manager: EntityManager, organizationId: string, code: 'HQ' | 'HCM') {
  const repository = manager.getRepository(Branch);
  let branch = await repository.findOneBy({ organizationId, code });
  if (!branch) {
    branch = repository.create(code === 'HQ' ? {
      organizationId, code, name: 'Văn phòng chính', email: 'danang@lemiex.vn', phone: '0905000001',
      addressLine: '07 Hóa Sơn 10, Đà Nẵng', latitude: '16.0544068', longitude: '108.2021667',
      geofenceRadiusM: 150, timezone: 'Asia/Ho_Chi_Minh', openingTime: '07:30:00', closingTime: '22:00:00',
      isHeadOffice: true, isActive: true, deletedAt: null,
    } : {
      organizationId, code, name: 'Chi nhánh Hồ Chí Minh', email: 'hcm@lemiex.vn', phone: '0905000002',
      addressLine: 'Quận 1, Thành phố Hồ Chí Minh', latitude: '10.7768890', longitude: '106.7008060',
      geofenceRadiusM: 150, timezone: 'Asia/Ho_Chi_Minh', openingTime: '07:30:00', closingTime: '22:00:00',
      isHeadOffice: false, isActive: true, deletedAt: null,
    });
  } else if (branch.deletedAt || !branch.isActive) {
    branch.deletedAt = null;
    branch.isActive = true;
    branch.updatedAt = new Date();
  }
  return repository.save(branch);
}

async function ensureDepartment(manager: EntityManager, organizationId: string, code: SeedPerson['departmentCode']) {
  const values = {
    OPERATIONS: ['Vận hành', 'Điều phối hoạt động và nhân sự theo ca'],
    HR: ['Nhân sự', 'Quản lý nhân sự và chính sách lao động'],
    FINANCE: ['Tài chính - Kế toán', 'Quản lý bảng công, tiền lương và chi phí'],
  } as const;
  const repository = manager.getRepository(Department);
  let department = await repository.findOneBy({ organizationId, code });
  if (!department) department = repository.create({ organizationId, parentId: null, code, name: values[code][0], description: values[code][1], isActive: true, deletedAt: null });
  else {
    department.name = values[code][0];
    department.description = values[code][1];
    department.isActive = true;
    department.deletedAt = null;
    department.updatedAt = new Date();
  }
  return repository.save(department);
}

async function ensurePosition(manager: EntityManager, organizationId: string, code: SeedPerson['positionCode']) {
  const values = {
    DIRECTOR: ['Giám đốc', true],
    OPS_MANAGER: ['Quản lý vận hành', true],
    OPERATIONS_STAFF: ['Nhân viên vận hành', false],
    HR_SPECIALIST: ['Chuyên viên nhân sự', false],
    PAYROLL_SPECIALIST: ['Chuyên viên tiền lương', false],
  } as const;
  const repository = manager.getRepository(Position);
  let position = await repository.findOneBy({ organizationId, code });
  if (!position) position = repository.create({ organizationId, code, name: values[code][0], description: null, isManager: values[code][1], isActive: true, deletedAt: null });
  else {
    position.name = values[code][0];
    position.isManager = values[code][1];
    position.isActive = true;
    position.deletedAt = null;
    position.updatedAt = new Date();
  }
  return repository.save(position);
}

async function ensureUser(manager: EntityManager, person: SeedPerson, passwordHash: string) {
  const repository = manager.getRepository(User);
  let user = await repository.createQueryBuilder('user')
    .where('LOWER(user.email) = :email', { email: person.email })
    .andWhere('user.deleted_at IS NULL')
    .getOne();
  const displayName = `${person.lastName} ${person.firstName}`;
  if (!user) user = repository.create({ email: person.email, phone: null, passwordHash, displayName, status: 'active', lastLoginAt: null, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, deletedAt: null });
  else {
    user.passwordHash = passwordHash;
    user.displayName = displayName;
    user.status = 'active';
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.passwordChangedAt = new Date();
    user.updatedAt = new Date();
  }
  return repository.save(user);
}

async function ensureRoleAssignment(manager: EntityManager, user: User, role: Role, departmentId: string | null, grantedBy: string) {
  const repository = manager.getRepository(UserRole);
  const existing = await repository.findOneBy({ userId: user.id, roleId: role.id, branchId: IsNull(), departmentId: departmentId ?? IsNull() });
  if (!existing) await repository.save(repository.create({ userId: user.id, roleId: role.id, branchId: null, departmentId, grantedBy }));
}

async function ensureEmployee(
  manager: EntityManager,
  organization: Organization,
  person: SeedPerson,
  user: User,
  branch: Branch,
  department: Department,
  position: Position,
  managerEmployeeId: string | null,
  actorId: string,
) {
  const repository = manager.getRepository(Employee);
  let employee = await repository.findOneBy({ organizationId: organization.id, employeeCode: person.code });
  const values = {
    userId: user.id, firstName: person.firstName, lastName: person.lastName, preferredName: null,
    dateOfBirth: null, gender: null, personalEmail: null, workEmail: person.email, phone: null,
    address: branch.addressLine, emergencyContactName: null, emergencyContactPhone: null,
    emergencyContactRelationship: null, employmentType: person.employmentType, employmentStatus: 'active',
    hireDate: '2026-01-05', terminationDate: null, terminationReason: null, primaryBranchId: branch.id,
    departmentId: department.id, positionId: position.id, managerId: managerEmployeeId,
    avatarUrl: null, notes: `${DEMO_MARKER}: Hồ sơ dùng để kiểm thử hệ thống`, deletedAt: null,
  };
  if (!employee) employee = repository.create({ organizationId: organization.id, employeeCode: person.code, ...values });
  else Object.assign(employee, values, { updatedAt: new Date() });
  employee = await repository.save(employee);

  const historyRepository = manager.getRepository(EmployeeWorkHistory);
  let history = await historyRepository.findOneBy({ employeeId: employee.id, effectiveTo: IsNull() });
  const historyValues = { branchId: branch.id, departmentId: department.id, positionId: position.id, managerId: managerEmployeeId, employmentType: person.employmentType, effectiveFrom: '2026-01-05', effectiveTo: null, reason: `${DEMO_MARKER}: Tiếp nhận nhân viên`, createdBy: actorId };
  if (!history) history = historyRepository.create({ employeeId: employee.id, ...historyValues });
  else Object.assign(history, historyValues);
  await historyRepository.save(history);

  const salaryRepository = manager.getRepository(EmployeeSalaryRate);
  let salary = await salaryRepository.findOneBy({ employeeId: employee.id, effectiveTo: IsNull() });
  const salaryValues = { payType: person.salaryType, baseRate: person.salary, currencyCode: 'VND', effectiveFrom: '2026-01-05', effectiveTo: null, note: `${DEMO_MARKER}: Mức lương mẫu`, createdBy: actorId };
  if (!salary) salary = salaryRepository.create({ employeeId: employee.id, ...salaryValues });
  else Object.assign(salary, salaryValues);
  await salaryRepository.save(salary);
  return employee;
}

async function ensureShiftTemplate(manager: EntityManager, organizationId: string, branch: Branch) {
  const repository = manager.getRepository(ShiftTemplate);
  const code = branch.code === 'HQ' ? 'DEMO-OFFICE-0800' : `DEMO-OFFICE-${branch.code}-0800`;
  let template = await repository.findOneBy({ organizationId, code });
  const values = { branchId: branch.id, name: `Ca hành chính ${branch.code} 08:00 - 17:00`, color: '#2563EB', startTime: '08:00:00', endTime: '17:00:00', crossesMidnight: false, unpaidBreakMinutes: 60, requiredHeadcount: 2, isActive: true };
  if (!template) template = repository.create({ organizationId, code, ...values });
  else Object.assign(template, values, { updatedAt: new Date() });
  return repository.save(template);
}

async function ensureShift(manager: EntityManager, date: string, branch: Branch, department: Department, position: Position, template: ShiftTemplate, actorId: string, isFuture = false) {
  const repository = manager.getRepository(Shift);
  const marker = `${DEMO_MARKER}:SHIFT:${branch.code}:${date}`;
  let shift = await repository.findOneBy({ notes: marker });
  const values = {
    shiftTemplateId: template.id, branchId: branch.id, departmentId: department.id, positionId: position.id,
    name: `Ca vận hành ${branch.code}`, startsAt: at(date, '08:00'), endsAt: at(date, '17:00'), unpaidBreakMinutes: 60,
    requiredHeadcount: 2, status: isFuture ? 'published' : 'completed', recurrenceGroupId: null, notes: marker,
    publishedAt: at(date, '07:00'), publishedBy: actorId, createdBy: actorId, deletedAt: null,
  };
  if (!shift) shift = repository.create(values);
  else Object.assign(shift, values, { updatedAt: new Date() });
  return repository.save(shift);
}

async function ensureAssignment(manager: EntityManager, shift: Shift, employee: Employee, actorId: string) {
  const repository = manager.getRepository(ShiftAssignment);
  let assignment = await repository.findOneBy({ shiftId: shift.id, employeeId: employee.id });
  if (!assignment) assignment = repository.create({ shiftId: shift.id, employeeId: employee.id, assignmentStatus: 'confirmed', assignedBy: actorId, cancelledAt: null, cancellationReason: null });
  else Object.assign(assignment, { assignmentStatus: 'confirmed', assignedBy: actorId, cancelledAt: null, cancellationReason: null });
  return repository.save(assignment);
}

async function ensureEvent(manager: EntityManager, record: AttendanceRecord, eventType: AttendanceEvent['eventType'], time: string, branch: Branch, userId: string) {
  const repository = manager.getRepository(AttendanceEvent);
  let event = await repository.findOneBy({ attendanceRecordId: record.id, eventType });
  const values = {
    employeeId: record.employeeId, occurredAt: at(record.workDate, time), receivedAt: at(record.workDate, time), method: 'web',
    deviceId: 'demo-browser-chrome', ipAddress: '127.0.0.1', latitude: branch.latitude, longitude: branch.longitude,
    locationAccuracyM: '8.50', distanceFromBranchM: '12.00', isWithinGeofence: true,
    photoUrl: `/demo/attendance/${record.employeeId}-${record.workDate}-${eventType}.jpg`,
    note: `${DEMO_MARKER}: Sự kiện chấm công mẫu`, metadata: { seeded: true, userAgent: 'Demo browser' }, createdBy: userId,
  };
  if (!event) event = repository.create({ attendanceRecordId: record.id, eventType, ...values });
  else Object.assign(event, values);
  await repository.save(event);
}

async function ensureViolation(manager: EntityManager, record: AttendanceRecord, assignment: ShiftAssignment, scenario: AttendanceScenario) {
  if (!scenario.violation) return;
  const repository = manager.getRepository(AttendanceViolation);
  let violation = await repository.findOneBy({ employeeId: record.employeeId, attendanceRecordId: record.id, violationType: scenario.violation.type, violationDate: record.workDate });
  const detectedAt = at(record.workDate, '23:59');
  const values = { shiftAssignmentId: assignment.id, minutesAffected: scenario.violation.minutes, severity: scenario.violation.severity ?? 'warning', status: 'active', details: scenario.violation.details, detectedAt, firstDetectedAt: detectedAt, lastDetectedAt: detectedAt, finalizedAt: detectedAt, graceMinutes: 0, calculationSnapshot: { seeded: true }, calculationVersion: 1, clearedAt: null, clearedReason: null, excludedBy: null, excludedAt: null, exclusionReason: null, sourceUpdatedAt: detectedAt, resolvedBy: null, resolvedAt: null, resolutionNote: null };
  if (!violation) violation = repository.create({ employeeId: record.employeeId, attendanceRecordId: record.id, violationType: scenario.violation.type, violationDate: record.workDate, ...values });
  else Object.assign(violation, values);
  await repository.save(violation);
}

async function ensureAttendance(manager: EntityManager, employee: Employee, user: User, branch: Branch, assignment: ShiftAssignment, date: string, scenario: AttendanceScenario) {
  const repository = manager.getRepository(AttendanceRecord);
  let record = await repository.findOneBy({ employeeId: employee.id, shiftAssignmentId: assignment.id, workDate: date });
  const breakMinutes = minutesBetween(scenario.breakStart, scenario.breakEnd);
  const totalMinutes = minutesBetween(scenario.checkIn, scenario.checkOut);
  const workedMinutes = Math.max(totalMinutes - breakMinutes, 0);
  const lateMinutes = scenario.checkIn ? Math.max(minutesBetween('08:00', scenario.checkIn), 0) : 0;
  const earlyLeaveMinutes = scenario.checkOut ? Math.max(minutesBetween(scenario.checkOut, '17:00'), 0) : 0;
  const overtimeMinutes = scenario.checkOut ? Math.max(minutesBetween('17:00', scenario.checkOut), 0) : 0;
  const values = {
    branchId: branch.id, actualCheckInAt: scenario.checkIn ? at(date, scenario.checkIn) : null,
    actualCheckOutAt: scenario.checkOut ? at(date, scenario.checkOut) : null, scheduledMinutes: 480,
    workedMinutes, breakMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes,
    status: scenario.status, source: 'system', updatedAt: new Date(),
  };
  if (!record) record = repository.create({ employeeId: employee.id, shiftAssignmentId: assignment.id, workDate: date, ...values });
  else Object.assign(record, values);
  record = await repository.save(record);

  const eventTimes: Array<[AttendanceEvent['eventType'], string | undefined]> = [
    ['check_in', scenario.checkIn], ['break_start', scenario.breakStart], ['break_end', scenario.breakEnd], ['check_out', scenario.checkOut],
  ];
  for (const [eventType, time] of eventTimes) if (time) await ensureEvent(manager, record, eventType, time, branch, user.id);
  await ensureViolation(manager, record, assignment, scenario);
}

async function ensureOutsideScheduleAttendance(manager: EntityManager, employee: Employee, user: User, branch: Branch) {
  const date = '2026-10-10';
  const repository = manager.getRepository(AttendanceRecord);
  let record = await repository.findOneBy({ employeeId: employee.id, shiftAssignmentId: IsNull(), workDate: date });
  const values = { branchId: branch.id, actualCheckInAt: at(date, '09:00'), actualCheckOutAt: at(date, '13:00'), scheduledMinutes: 0, workedMinutes: 240, breakMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'completed', source: 'system', updatedAt: new Date() };
  if (!record) record = repository.create({ employeeId: employee.id, shiftAssignmentId: null, workDate: date, ...values });
  else Object.assign(record, values);
  record = await repository.save(record);
  await ensureEvent(manager, record, 'check_in', '09:00', branch, user.id);
  await ensureEvent(manager, record, 'check_out', '13:00', branch, user.id);
}

async function ensureLeaveSetup(manager: EntityManager, organization: Organization, employees: Map<string, Employee>, actorId: string) {
  const definitions = [
    { code: 'ANNUAL_LEAVE', name: 'Nghỉ phép năm', description: 'Nghỉ có lương theo hạn mức hằng năm.', color: '#2563EB', isPaid: true, unit: 'both', tracksBalance: true, requiresAttachment: false, attachmentRequiredAfter: null, minNoticeDays: 1, allowRetroactive: false, requiresApproval: true, policy: { name: 'Hạn mức phép năm 2026', accrualMethod: 'upfront', allowanceAmount: 12, carryoverLimit: 5, maxBalance: 17, prorateNewHires: true } },
    { code: 'SICK_LEAVE', name: 'Nghỉ ốm', description: 'Nghỉ có lương khi nhân viên không đủ sức khỏe làm việc.', color: '#0F9F78', isPaid: true, unit: 'both', tracksBalance: true, requiresAttachment: true, attachmentRequiredAfter: 2, minNoticeDays: 0, allowRetroactive: true, requiresApproval: true, policy: { name: 'Hạn mức nghỉ ốm 2026', accrualMethod: 'upfront', allowanceAmount: 6, carryoverLimit: 0, maxBalance: 6, prorateNewHires: true } },
    { code: 'UNPAID_LEAVE', name: 'Nghỉ không lương', description: 'Nghỉ không hưởng lương và không kiểm soát hạn mức.', color: '#D97706', isPaid: false, unit: 'both', tracksBalance: false, requiresAttachment: false, attachmentRequiredAfter: null, minNoticeDays: 2, allowRetroactive: false, requiresApproval: true, policy: null },
    { code: 'COMPENSATORY_LEAVE', name: 'Nghỉ bù', description: 'Sử dụng số giờ nghỉ bù được ghi nhận từ làm thêm hoặc điều chỉnh.', color: '#0891B2', isPaid: true, unit: 'hour', tracksBalance: true, requiresAttachment: false, attachmentRequiredAfter: null, minNoticeDays: 1, allowRetroactive: false, requiresApproval: true, policy: { name: 'Chính sách nghỉ bù 2026', accrualMethod: 'none', allowanceAmount: 0, carryoverLimit: 0, maxBalance: 40, prorateNewHires: false } },
  ] as const;
  const leaveTypes = new Map<string, LeaveType>();
  for (const definition of definitions) {
    const repository = manager.getRepository(LeaveType);
    let type = await repository.findOneBy({ organizationId: organization.id, code: definition.code });
    const values = {
      name: definition.name, description: definition.description, color: definition.color, isPaid: definition.isPaid,
      unit: definition.unit, annualAllowance: definition.policy ? String(definition.policy.allowanceAmount) : null,
      tracksBalance: definition.tracksBalance, allowNegativeBalance: false, requiresAttachment: definition.requiresAttachment,
      attachmentRequiredAfter: definition.attachmentRequiredAfter == null ? null : String(definition.attachmentRequiredAfter),
      hoursPerDay: '8', hourIncrementMinutes: 30, minNoticeDays: definition.minNoticeDays,
      allowRetroactive: definition.allowRetroactive, requiresApproval: definition.requiresApproval, isActive: true,
    };
    if (!type) type = repository.create({ organizationId: organization.id, code: definition.code, ...values });
    else Object.assign(type, values, { updatedAt: new Date() });
    type = await repository.save(type);
    leaveTypes.set(definition.code, type);

    if (definition.policy) {
      const policyRepository = manager.getRepository(LeaveEntitlementPolicy);
      let policy = await policyRepository.findOneBy({ leaveTypeId: type.id, name: definition.policy.name });
      const policyValues = {
        organizationId: organization.id, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
        accrualMethod: definition.policy.accrualMethod, allowanceAmount: String(definition.policy.allowanceAmount),
        carryoverLimit: String(definition.policy.carryoverLimit), maxBalance: String(definition.policy.maxBalance),
        prorateNewHires: definition.policy.prorateNewHires, appliesToEmploymentType: null, isActive: true,
      };
      if (!policy) policy = policyRepository.create({ leaveTypeId: type.id, name: definition.policy.name, ...policyValues });
      else Object.assign(policy, policyValues, { updatedAt: new Date() });
      await policyRepository.save(policy);
    }
  }

  for (const employee of employees.values()) {
    for (const code of ['ANNUAL_LEAVE', 'SICK_LEAVE'] as const) {
      const leaveType = leaveTypes.get(code)!;
      const isPartTime = employee.employmentType === 'part_time';
      const amount = code === 'ANNUAL_LEAVE' ? (isPartTime ? 6 : 12) : (isPartTime ? 3 : 6);
      const balanceRepository = manager.getRepository(LeaveBalance);
      let balance = await balanceRepository.findOneBy({ employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: 2026 });
      const balanceValues = { openingAmount: '0', accruedAmount: String(amount), usedAmount: '0', reservedAmount: '0', expiredAmount: '0', adjustedAmount: '0', updatedAt: new Date() };
      if (!balance) balance = balanceRepository.create({ employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: 2026, ...balanceValues });
      else Object.assign(balance, balanceValues);
      balance = await balanceRepository.save(balance);
      const transactionRepository = manager.getRepository(LeaveBalanceTransaction);
      const description = `${DEMO_MARKER}: Cấp ${amount} ${leaveType.unit === 'hour' ? 'giờ' : 'ngày'} ${leaveType.name} năm 2026`;
      let transaction = await transactionRepository.findOneBy({ leaveBalanceId: balance.id, description });
      if (!transaction) transaction = transactionRepository.create({ leaveBalanceId: balance.id, leaveRequestId: null, transactionType: 'accrual', amount: String(amount), balanceBefore: '0', balanceAfter: String(amount), effectiveDate: '2026-01-01', description, createdBy: actorId });
      else Object.assign(transaction, { amount: String(amount), balanceBefore: '0', balanceAfter: String(amount), effectiveDate: '2026-01-01', createdBy: actorId });
      await transactionRepository.save(transaction);
    }
  }

  const requestDefinitions = [
    { marker: 'AN_PENDING', employeeCode: 'LMX-NV-001', leaveTypeCode: 'ANNUAL_LEAVE', startsAt: at('2026-10-26', '00:00'), endsAt: at('2026-10-27', '00:00'), requestMode: 'full_day', dayPart: null, amount: 1, unit: 'day', balanceAmount: 1, status: 'pending', reason: `${DEMO_MARKER}: Nghỉ phép cá nhân`, reviewed: false },
    { marker: 'BINH_APPROVED', employeeCode: 'LMX-NV-002', leaveTypeCode: 'SICK_LEAVE', startsAt: at('2026-10-23', '00:00'), endsAt: at('2026-10-24', '00:00'), requestMode: 'full_day', dayPart: null, amount: 1, unit: 'day', balanceAmount: 1, status: 'approved', reason: `${DEMO_MARKER}: Nghỉ ốm đã duyệt`, reviewed: true },
    { marker: 'CHI_HOURLY', employeeCode: 'LMX-NV-003', leaveTypeCode: 'ANNUAL_LEAVE', startsAt: at('2026-10-27', '13:00'), endsAt: at('2026-10-27', '15:00'), requestMode: 'hourly', dayPart: null, amount: 2, unit: 'hour', balanceAmount: 0.25, status: 'pending', reason: `${DEMO_MARKER}: Nghỉ theo giờ có hưởng lương`, reviewed: false },
    { marker: 'DUNG_UNPAID', employeeCode: 'LMX-NV-004', leaveTypeCode: 'UNPAID_LEAVE', startsAt: at('2026-10-28', '00:00'), endsAt: at('2026-10-29', '00:00'), requestMode: 'full_day', dayPart: null, amount: 1, unit: 'day', balanceAmount: 0, status: 'pending', reason: `${DEMO_MARKER}: Nghỉ việc riêng không hưởng lương`, reviewed: false },
  ] as const;
  const requestRepository = manager.getRepository(LeaveRequest);
  const balanceRepository = manager.getRepository(LeaveBalance);
  const transactionRepository = manager.getRepository(LeaveBalanceTransaction);
  for (const definition of requestDefinitions) {
    const employee = employees.get(definition.employeeCode)!;
    const leaveType = leaveTypes.get(definition.leaveTypeCode)!;
    const reason = `${definition.reason} [${definition.marker}]`;
    let request = await requestRepository.findOneBy({ employeeId: employee.id, reason });
    const requestValues = {
      leaveTypeId: leaveType.id, startsAt: definition.startsAt, endsAt: definition.endsAt,
      requestMode: definition.requestMode, dayPart: definition.dayPart, requestedAmount: String(definition.amount),
      unitSnapshot: definition.unit, isPaidSnapshot: leaveType.isPaid, hoursPerDaySnapshot: leaveType.hoursPerDay,
      balanceYear: 2026, attachmentUrl: null, status: definition.status, requestedAt: at('2026-10-19', '09:00'),
      requestedBy: employee.userId, reviewedBy: definition.reviewed ? actorId : null,
      reviewedAt: definition.reviewed ? at('2026-10-19', '10:00') : null,
      reviewNote: definition.reviewed ? 'Dữ liệu mẫu đã được HR duyệt' : null, cancelledAt: null,
    };
    if (!request) request = requestRepository.create({ employeeId: employee.id, reason, ...requestValues });
    else Object.assign(request, requestValues, { updatedAt: new Date() });
    request = await requestRepository.save(request);

    if (!leaveType.tracksBalance) continue;
    const balance = await balanceRepository.findOneByOrFail({ employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: 2026 });
    if (definition.status === 'pending') balance.reservedAmount = String(Number(balance.reservedAmount) + definition.balanceAmount);
    if (definition.status === 'approved') balance.usedAmount = String(Number(balance.usedAmount) + definition.balanceAmount);
    await balanceRepository.save(balance);
    const transactionType = definition.status === 'approved' ? 'usage' : 'reservation';
    const before = Number(balance.openingAmount) + Number(balance.accruedAmount) + Number(balance.adjustedAmount);
    const balanceAfter = before - definition.balanceAmount;
    let transaction = await transactionRepository.findOneBy({ leaveRequestId: request.id, transactionType });
    const transactionValues = {
      leaveBalanceId: balance.id, amount: String(-definition.balanceAmount), balanceBefore: String(before), balanceAfter: String(balanceAfter),
      effectiveDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(definition.startsAt), description: definition.status === 'approved' ? 'Dữ liệu mẫu: sử dụng số dư phép' : 'Dữ liệu mẫu: giữ chỗ số dư phép', createdBy: actorId,
    };
    if (!transaction) transaction = transactionRepository.create({ leaveRequestId: request.id, transactionType, ...transactionValues });
    else Object.assign(transaction, transactionValues);
    await transactionRepository.save(transaction);
  }
  return { types: definitions.length, balances: employees.size * 2, requests: requestDefinitions.length };
}

async function seed() {
  const password = process.env.SEED_PASSWORD ?? DEFAULT_PASSWORD;
  if (password.length < 12) throw new Error('SEED_PASSWORD phải có ít nhất 12 ký tự');
  const passwordHash = await hash(password, 12);
  await dataSource.initialize();

  const result = await dataSource.transaction(async (manager) => {
    const organization = await ensureOrganization(manager);
    const roles = await manager.getRepository(Role).find();
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const missingRoles = [...new Set(people.map((person) => person.role))].filter((code) => !roleByCode.has(code));
    if (missingRoles.length) throw new Error(`Thiếu role ${missingRoles.join(', ')}. Hãy chạy migration trước.`);

    const branches = new Map<string, Branch>();
    for (const code of ['HQ', 'HCM'] as const) branches.set(code, await ensureBranch(manager, organization.id, code));
    const departments = new Map<string, Department>();
    for (const code of ['OPERATIONS', 'HR', 'FINANCE'] as const) departments.set(code, await ensureDepartment(manager, organization.id, code));
    const positions = new Map<string, Position>();
    for (const code of ['DIRECTOR', 'OPS_MANAGER', 'OPERATIONS_STAFF', 'HR_SPECIALIST', 'PAYROLL_SPECIALIST'] as const) positions.set(code, await ensurePosition(manager, organization.id, code));

    for (const branch of branches.values()) {
      for (const department of departments.values()) {
        const repository = manager.getRepository(BranchDepartment);
        const link = await repository.findOneBy({ branchId: branch.id, departmentId: department.id });
        if (!link) await repository.save(repository.create({ branchId: branch.id, departmentId: department.id, isActive: true }));
        else if (!link.isActive) await repository.update({ branchId: branch.id, departmentId: department.id }, { isActive: true });
      }
    }

    const users = new Map<string, User>();
    for (const person of people) users.set(person.code, await ensureUser(manager, person, passwordHash));
    const adminUser = users.get('LMX-ADM-001')!;

    const employees = new Map<string, Employee>();
    const managerPerson = people.find((person) => person.code === 'LMX-MGR-001')!;
    const managerEmployee = await ensureEmployee(manager, organization, managerPerson, users.get(managerPerson.code)!, branches.get(managerPerson.branchCode)!, departments.get(managerPerson.departmentCode)!, positions.get(managerPerson.positionCode)!, null, adminUser.id);
    employees.set(managerPerson.code, managerEmployee);

    for (const person of people.filter((item) => item.code !== managerPerson.code)) {
      const reportsToManager = person.departmentCode === 'OPERATIONS' && person.positionCode === 'OPERATIONS_STAFF';
      employees.set(person.code, await ensureEmployee(manager, organization, person, users.get(person.code)!, branches.get(person.branchCode)!, departments.get(person.departmentCode)!, positions.get(person.positionCode)!, reportsToManager ? managerEmployee.id : null, adminUser.id));
    }

    for (const person of people) {
      const role = roleByCode.get(person.role)!;
      const scopedDepartment = person.role === 'MANAGER' ? departments.get('OPERATIONS')!.id : null;
      await ensureRoleAssignment(manager, users.get(person.code)!, role, scopedDepartment, adminUser.id);
    }

    const leaveSetup = await ensureLeaveSetup(manager, organization, employees, adminUser.id);

    const operations = departments.get('OPERATIONS')!;
    const staffPosition = positions.get('OPERATIONS_STAFF')!;
    const staff = people.filter((person) => person.role === 'EMPLOYEE');
    const templates = new Map<string, ShiftTemplate>();
    for (const branchCode of ['HQ', 'HCM'] as const) templates.set(branchCode, await ensureShiftTemplate(manager, organization.id, branches.get(branchCode)!));

    let assignmentCount = 0;
    let attendanceCount = 0;
    for (const date of [...workDates, '2026-10-19']) {
      for (const branchCode of ['HQ', 'HCM'] as const) {
        const branchStaff = staff.filter((person) => person.branchCode === branchCode);
        const shift = await ensureShift(manager, date, branches.get(branchCode)!, operations, staffPosition, templates.get(branchCode)!, adminUser.id, date === '2026-10-19');
        for (const person of branchStaff) {
          const assignment = await ensureAssignment(manager, shift, employees.get(person.code)!, adminUser.id);
          assignmentCount += 1;
          if (date !== '2026-10-19') {
            await ensureAttendance(manager, employees.get(person.code)!, users.get(person.code)!, branches.get(branchCode)!, assignment, date, scenarioFor(person.code, date));
            attendanceCount += 1;
          }
        }
      }
    }
    const outsidePerson = people.find((person) => person.code === 'LMX-NV-003')!;
    await ensureOutsideScheduleAttendance(manager, employees.get(outsidePerson.code)!, users.get(outsidePerson.code)!, branches.get(outsidePerson.branchCode)!);
    attendanceCount += 1;

    return { organization: organization.name, accounts: people.map(({ role, email, code }) => ({ role, email, employeeCode: code })), employees: people.length, assignments: assignmentCount, attendanceRecords: attendanceCount, leaveTypes: leaveSetup.types, leaveBalances: leaveSetup.balances, leaveRequests: leaveSetup.requests };
  });

  await dataSource.destroy();
  console.log('\nDữ liệu demo đã sẵn sàng (có thể chạy lại an toàn).');
  console.table(result.accounts);
  console.log(`Doanh nghiệp: ${result.organization}`);
  console.log(`Mật khẩu chung: ${password}`);
  console.log(`Nhân viên: ${result.employees} | Phân ca: ${result.assignments} | Bản ghi chấm công: ${result.attendanceRecords}`);
  console.log(`Loại nghỉ: ${result.leaveTypes} | Số dư phép mẫu: ${result.leaveBalances} | Yêu cầu nghỉ mẫu: ${result.leaveRequests}`);
  console.log('Kỳ dữ liệu: 05/10/2026 - 19/10/2026; gồm đúng giờ, đi muộn, về sớm, nghỉ quá giờ, overtime, thiếu check-in/out, vắng mặt và chấm công ngoài lịch.');
}

void seed().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
