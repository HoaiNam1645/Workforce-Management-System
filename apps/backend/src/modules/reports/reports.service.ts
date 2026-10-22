import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';

type Row = Record<string, string | number | boolean | Date | null>;

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource) {}

  async overview(query: ReportQueryDto, actor: AuthUser) {
    const range = this.range(query);
    const organization = await this.organization(actor);
    const scope = this.scope(actor, query);
    const canViewPayroll = actor.permissions.includes('payroll.view');
    const params = [organization.id, range.from, range.to, scope.branchIds, scope.departmentIds, query.positionId ?? null];
    const employeeWhere = `e.organization_id=$1 AND e.deleted_at IS NULL
      AND ($4::uuid[] IS NULL OR e.primary_branch_id=ANY($4)) AND ($5::uuid[] IS NULL OR e.department_id=ANY($5)) AND ($6::uuid IS NULL OR e.position_id=$6)`;
    const shiftWhere = `s.branch_id IN (SELECT id FROM workforce.branches WHERE organization_id=$1) AND s.deleted_at IS NULL AND s.starts_at < $3::date + interval '1 day' AND s.ends_at >= $2::date
      AND ($4::uuid[] IS NULL OR s.branch_id=ANY($4)) AND ($5::uuid[] IS NULL OR s.department_id=ANY($5)) AND ($6::uuid IS NULL OR s.position_id=$6)`;
    const [employees, schedule, attendance, anomalies, leave, timesheets, payroll, trend, dimensions, performance, options,
      employeeRows, scheduleRows, attendanceRows, anomalyRows, leaveRows, timesheetRows, payrollRows, overtimeRows] = await Promise.all([
      this.one(`SELECT count(*) FILTER (WHERE e.hire_date < $2::date AND (e.termination_date IS NULL OR e.termination_date >= $2::date)) headcount_start,
        count(*) FILTER (WHERE e.hire_date <= $3::date AND (e.termination_date IS NULL OR e.termination_date > $3::date)) headcount_end,
        count(*) FILTER (WHERE e.employment_status='active') active,
        count(*) FILTER (WHERE e.employment_status='on_leave') on_leave,
        count(*) FILTER (WHERE e.employment_status='terminated' AND e.termination_date BETWEEN $2 AND $3) terminated,
        count(*) FILTER (WHERE e.hire_date BETWEEN $2 AND $3) new_hires,
        count(*) FILTER (WHERE e.employment_type='full_time' AND e.employment_status='active') full_time,
        count(*) FILTER (WHERE e.employment_type='part_time' AND e.employment_status='active') part_time,
        coalesce(round(avg(($3::date-e.hire_date)::numeric) FILTER (WHERE e.hire_date <= $3::date AND (e.termination_date IS NULL OR e.termination_date > $3::date))),0) average_tenure_days
        FROM workforce.employees e WHERE ${employeeWhere}`, params),
      this.one(`SELECT count(s.id) shifts, coalesce(sum(s.required_headcount),0) required,
        coalesce(sum(x.assigned),0) assigned,
        count(DISTINCT s.id) FILTER (WHERE coalesce(x.assigned,0)=s.required_headcount) fully_staffed,
        count(DISTINCT s.id) FILTER (WHERE coalesce(x.assigned,0)<s.required_headcount) understaffed,
        count(DISTINCT s.id) FILTER (WHERE coalesce(x.assigned,0)>s.required_headcount) overstaffed,
        count(DISTINCT s.id) FILTER (WHERE coalesce(x.assigned,0)=0) unassigned
        FROM workforce.shifts s
        LEFT JOIN (SELECT shift_id,count(*) FILTER (WHERE assignment_status IN ('assigned','confirmed')) assigned FROM workforce.shift_assignments GROUP BY shift_id) x ON x.shift_id=s.id
        WHERE ${shiftWhere} AND s.status='published'`, params),
      this.one(`SELECT count(*) records,
        count(*) FILTER (WHERE ar.actual_check_in_at IS NOT NULL) check_ins,
        count(*) FILTER (WHERE ar.actual_check_out_at IS NOT NULL) check_outs,
        count(*) FILTER (WHERE ar.status='completed') completed,
        count(*) FILTER (WHERE ar.status='missing_check_in') missing_check_in, count(*) FILTER (WHERE ar.status='missing_check_out') missing_check_out,
        count(*) FILTER (WHERE ar.status='absent') absent, coalesce(sum(ar.scheduled_minutes),0) scheduled_minutes,
        coalesce(sum(ar.worked_minutes),0) worked_minutes, coalesce(sum(ar.break_minutes),0) break_minutes,
        coalesce(sum(ar.overtime_minutes),0) overtime_minutes, coalesce(sum(ar.late_minutes),0) late_minutes,
        coalesce(sum(ar.early_leave_minutes),0) early_leave_minutes,
        count(*) FILTER (WHERE ar.shift_assignment_id IS NULL) outside_schedule,
        count(*) FILTER (WHERE ar.break_minutes=0 AND ar.status='completed') no_break,
        count(*) FILTER (WHERE ar.break_minutes>0 AND ar.break_minutes<=coalesce(s.unpaid_break_minutes,0)) break_within_limit,
        count(*) FILTER (WHERE ar.break_minutes>coalesce(s.unpaid_break_minutes,0)) break_over_limit,
        coalesce(sum(greatest(ar.break_minutes-coalesce(s.unpaid_break_minutes,0),0)),0) break_over_minutes,
        count(DISTINCT ar.employee_id) FILTER (WHERE ar.overtime_minutes>0) overtime_employees,
        (SELECT count(*) FROM workforce.attendance_events ae JOIN workforce.employees ee ON ee.id=ae.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND ae.occurred_at >= $2::date AND ae.occurred_at < $3::date + interval '1 day' AND ae.latitude IS NOT NULL AND ae.longitude IS NOT NULL) events_with_gps,
        (SELECT count(*) FROM workforce.attendance_events ae JOIN workforce.employees ee ON ee.id=ae.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND ae.occurred_at >= $2::date AND ae.occurred_at < $3::date + interval '1 day' AND (ae.latitude IS NULL OR ae.longitude IS NULL)) events_without_gps,
        (SELECT count(*) FROM workforce.attendance_events ae JOIN workforce.employees ee ON ee.id=ae.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND ae.occurred_at >= $2::date AND ae.occurred_at < $3::date + interval '1 day' AND ae.photo_url IS NOT NULL) events_with_selfie,
        (SELECT count(*) FROM workforce.attendance_events ae JOIN workforce.employees ee ON ee.id=ae.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND ae.occurred_at >= $2::date AND ae.occurred_at < $3::date + interval '1 day' AND ae.is_within_geofence=false) outside_geofence,
        (SELECT count(*) FROM workforce.attendance_adjustment_requests aar JOIN workforce.attendance_records rr ON rr.id=aar.attendance_record_id JOIN workforce.employees ee ON ee.id=rr.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND rr.work_date BETWEEN $2 AND $3) adjustment_requests,
        (SELECT count(*) FROM workforce.attendance_records rr JOIN workforce.employees ee ON ee.id=rr.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND rr.work_date BETWEEN $2 AND $3 AND (SELECT ae.event_type FROM workforce.attendance_events ae WHERE ae.attendance_record_id=rr.id AND ae.event_type IN ('break_start','break_end') ORDER BY ae.occurred_at DESC LIMIT 1)='break_start') open_breaks
        FROM workforce.attendance_records ar JOIN workforce.employees e ON e.id=ar.employee_id
        LEFT JOIN workforce.shift_assignments sa ON sa.id=ar.shift_assignment_id LEFT JOIN workforce.shifts s ON s.id=sa.shift_id
        WHERE ${employeeWhere} AND ar.work_date BETWEEN $2 AND $3`, params),
      this.rows(`SELECT av.violation_type key,count(*) value,coalesce(sum(av.minutes_affected),0) minutes
        FROM workforce.attendance_violations av JOIN workforce.employees e ON e.id=av.employee_id
        WHERE ${employeeWhere} AND av.violation_date BETWEEN $2 AND $3 AND av.status IN ('active','provisional') GROUP BY av.violation_type ORDER BY count(*) DESC`, params),
      this.one(`SELECT count(*) total, count(*) FILTER (WHERE lr.status='approved') approved,
        count(*) FILTER (WHERE lr.status='pending') pending, count(*) FILTER (WHERE lr.status='rejected') rejected, count(*) FILTER (WHERE lr.status='cancelled') cancelled,
        coalesce(sum(lr.requested_amount) FILTER (WHERE lr.status='approved'),0) approved_amount,
        coalesce(sum(lr.requested_amount) FILTER (WHERE lr.status='approved' AND lr.is_paid_snapshot),0) paid_amount,
        coalesce(sum(lr.requested_amount) FILTER (WHERE lr.status='approved' AND NOT lr.is_paid_snapshot),0) unpaid_amount,
        coalesce(round(avg(extract(epoch FROM(lr.reviewed_at-lr.requested_at))/3600) FILTER (WHERE lr.reviewed_at IS NOT NULL),1),0) average_review_hours,
        (SELECT coalesce(sum(lb.opening_amount+lb.accrued_amount+lb.adjusted_amount-lb.used_amount-lb.reserved_amount-lb.expired_amount) FILTER (WHERE lt.unit<>'hour'),0) FROM workforce.leave_balances lb JOIN workforce.leave_types lt ON lt.id=lb.leave_type_id JOIN workforce.employees ee ON ee.id=lb.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND lb.balance_year=extract(year FROM $3::date)) balance_available_days,
        (SELECT coalesce(sum(lb.opening_amount+lb.accrued_amount+lb.adjusted_amount-lb.used_amount-lb.reserved_amount-lb.expired_amount) FILTER (WHERE lt.unit='hour'),0) FROM workforce.leave_balances lb JOIN workforce.leave_types lt ON lt.id=lb.leave_type_id JOIN workforce.employees ee ON ee.id=lb.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND lb.balance_year=extract(year FROM $3::date)) balance_available_hours,
        (SELECT count(*) FROM workforce.leave_balances lb JOIN workforce.leave_types lt ON lt.id=lb.leave_type_id JOIN workforce.employees ee ON ee.id=lb.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND lb.balance_year=extract(year FROM $3::date) AND lt.unit<>'hour' AND lb.opening_amount+lb.accrued_amount+lb.adjusted_amount-lb.used_amount-lb.reserved_amount-lb.expired_amount<=2) low_balances
        FROM workforce.leave_requests lr JOIN workforce.employees e ON e.id=lr.employee_id
        WHERE ${employeeWhere} AND lr.starts_at < $3::date + interval '1 day' AND lr.ends_at >= $2::date`, params),
      this.one(`SELECT count(*) total, count(*) FILTER (WHERE t.status='draft') draft, count(*) FILTER (WHERE t.status='approved') approved,
        count(*) FILTER (WHERE t.status='locked') locked, coalesce(sum(t.regular_minutes),0) regular_minutes,
        coalesce(sum(t.scheduled_minutes),0) scheduled_minutes, coalesce(sum(t.worked_minutes),0) worked_minutes,
        coalesce(sum(t.overtime_minutes),0) overtime_minutes, coalesce(sum(t.break_minutes),0) break_minutes,
        count(*) FILTER (WHERE t.status='rejected') rejected,
        (SELECT count(*) FROM workforce.timesheet_adjustments ta JOIN workforce.timesheets tt ON tt.id=ta.timesheet_id JOIN workforce.timesheet_periods ttp ON ttp.id=tt.period_id JOIN workforce.employees ee ON ee.id=tt.employee_id WHERE ${employeeWhere.replaceAll('e.', 'ee.')} AND ttp.starts_on <= $3 AND ttp.ends_on >= $2) adjustments
        FROM workforce.timesheets t JOIN workforce.timesheet_periods tp ON tp.id=t.period_id JOIN workforce.employees e ON e.id=t.employee_id
        WHERE ${employeeWhere} AND tp.starts_on <= $3 AND tp.ends_on >= $2`, params),
      canViewPayroll ? this.one(`SELECT count(*) payslips, coalesce(sum(ep.base_salary),0) base_salary, coalesce(sum(ep.regular_pay),0) regular_pay,
        coalesce(sum(ep.gross_pay),0) gross_pay, coalesce(sum(ep.net_pay),0) net_pay,
        coalesce(sum(ep.overtime_pay),0) overtime_pay, coalesce(sum(ep.allowance_total),0) allowances,
        coalesce(sum(ep.bonus_total),0) bonuses, coalesce(sum(ep.deduction_total),0) deductions,
        coalesce(sum(ep.paid_total),0) paid_total, coalesce(sum(ep.balance_due),0) balance_due,
        count(*) FILTER (WHERE ep.status IN ('locked','paid','partially_paid')) finalized
        FROM workforce.employee_payrolls ep JOIN workforce.payroll_periods pp ON pp.id=ep.payroll_period_id JOIN workforce.employees e ON e.id=ep.employee_id
        WHERE ${employeeWhere} AND pp.starts_on <= $3 AND pp.ends_on >= $2`, params) : Promise.resolve({}),
      this.rows(`WITH days AS (SELECT generate_series($2::date,$3::date,'1 day'::interval)::date AS work_day)
        SELECT d.work_day::text key, coalesce((SELECT sum(greatest(extract(epoch FROM(s.ends_at-s.starts_at))/60-s.unpaid_break_minutes,0)) FROM workforce.shifts s JOIN workforce.shift_assignments sa ON sa.shift_id=s.id AND sa.assignment_status IN ('assigned','confirmed') WHERE s.status='published' AND s.deleted_at IS NULL AND s.starts_at::date=d.work_day AND ($4::uuid[] IS NULL OR s.branch_id=ANY($4)) AND ($5::uuid[] IS NULL OR s.department_id=ANY($5)) AND ($6::uuid IS NULL OR s.position_id=$6)),0)::int planned,
        coalesce((SELECT sum(ar.worked_minutes) FROM workforce.attendance_records ar JOIN workforce.employees e ON e.id=ar.employee_id WHERE ar.work_date=d.work_day AND ${employeeWhere}),0)::int actual
        FROM days d ORDER BY d.work_day`, params),
      this.rows(`SELECT b.id,b.name,'branch' kind,count(DISTINCT e.id) employees,coalesce(sum(ar.scheduled_minutes),0) scheduled_minutes,coalesce(sum(ar.worked_minutes),0) worked_minutes,coalesce(sum(ar.overtime_minutes),0) overtime_minutes,coalesce(sum(ar.late_minutes),0) late_minutes,count(ar.id) FILTER (WHERE ar.status='absent') absences
        FROM workforce.branches b LEFT JOIN workforce.employees e ON e.primary_branch_id=b.id AND e.deleted_at IS NULL LEFT JOIN workforce.attendance_records ar ON ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3
        WHERE b.organization_id=$1 AND b.deleted_at IS NULL AND ($4::uuid[] IS NULL OR b.id=ANY($4)) GROUP BY b.id,b.name
        UNION ALL SELECT d.id,d.name,'department',count(DISTINCT e.id),coalesce(sum(ar.scheduled_minutes),0),coalesce(sum(ar.worked_minutes),0),coalesce(sum(ar.overtime_minutes),0),coalesce(sum(ar.late_minutes),0),count(ar.id) FILTER (WHERE ar.status='absent')
        FROM workforce.departments d LEFT JOIN workforce.employees e ON e.department_id=d.id AND e.deleted_at IS NULL LEFT JOIN workforce.attendance_records ar ON ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3
        WHERE d.organization_id=$1 AND d.deleted_at IS NULL AND ($5::uuid[] IS NULL OR d.id=ANY($5)) GROUP BY d.id,d.name
        UNION ALL SELECT p.id,p.name,'position',count(DISTINCT e.id),coalesce(sum(ar.scheduled_minutes),0),coalesce(sum(ar.worked_minutes),0),coalesce(sum(ar.overtime_minutes),0),coalesce(sum(ar.late_minutes),0),count(ar.id) FILTER (WHERE ar.status='absent')
        FROM workforce.positions p LEFT JOIN workforce.employees e ON e.position_id=p.id AND e.deleted_at IS NULL LEFT JOIN workforce.attendance_records ar ON ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3
        WHERE p.organization_id=$1 AND p.deleted_at IS NULL AND ($6::uuid IS NULL OR p.id=$6) GROUP BY p.id,p.name ORDER BY kind,name`, params),
      this.rows(`SELECT e.id,e.employee_code,concat(e.last_name,' ',e.first_name) name,b.name branch,d.name department,p.name position,
        (SELECT count(*) FROM workforce.shift_assignments sa JOIN workforce.shifts s ON s.id=sa.shift_id WHERE sa.employee_id=e.id AND sa.assignment_status IN ('assigned','confirmed') AND s.status='published' AND ${shiftWhere}) shifts,
        (SELECT coalesce(sum(greatest(extract(epoch FROM(s.ends_at-s.starts_at))/60-s.unpaid_break_minutes,0)),0) FROM workforce.shift_assignments sa JOIN workforce.shifts s ON s.id=sa.shift_id WHERE sa.employee_id=e.id AND sa.assignment_status IN ('assigned','confirmed') AND s.status='published' AND ${shiftWhere}) scheduled_minutes,
        coalesce(sum(ar.worked_minutes),0) worked_minutes,coalesce(sum(ar.overtime_minutes),0) overtime_minutes,coalesce(sum(ar.late_minutes),0) late_minutes,
        count(ar.id) FILTER (WHERE ar.status='absent') absences,
        count(ar.id) FILTER (WHERE ar.actual_check_in_at IS NOT NULL) present_shifts,
        count(ar.id) FILTER (WHERE ar.actual_check_in_at IS NOT NULL AND ar.late_minutes=0) on_time_shifts,
        count(ar.id) FILTER (WHERE ar.worked_minutes>=ar.scheduled_minutes AND ar.actual_check_out_at IS NOT NULL) sufficient_shifts,
        coalesce((SELECT count(*) FROM workforce.attendance_violations av WHERE av.employee_id=e.id AND av.violation_date BETWEEN $2 AND $3 AND av.status IN ('active','provisional')),0) anomalies
        FROM workforce.employees e LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id LEFT JOIN workforce.positions p ON p.id=e.position_id
        LEFT JOIN workforce.attendance_records ar ON ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3
        WHERE ${employeeWhere} GROUP BY e.id,e.employee_code,e.last_name,e.first_name,b.name,d.name,p.name ORDER BY worked_minutes DESC,name LIMIT 100`, params),
      this.rows(`SELECT 'branch' kind,id,code,name FROM workforce.branches WHERE organization_id=$1 AND deleted_at IS NULL AND is_active=true
        UNION ALL SELECT 'department',id,code,name FROM workforce.departments WHERE organization_id=$1 AND deleted_at IS NULL AND is_active=true
        UNION ALL SELECT 'position',id,code,name FROM workforce.positions WHERE organization_id=$1 AND deleted_at IS NULL AND is_active=true ORDER BY kind,name`, [organization.id]),
      this.rows(`SELECT e.id,e.employee_code,concat(e.last_name,' ',e.first_name) name,e.employment_type,e.employment_status,e.hire_date::text hire_date,e.termination_date::text termination_date,b.name branch,d.name department,p.name position
        FROM workforce.employees e LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id LEFT JOIN workforce.positions p ON p.id=e.position_id
        WHERE ${employeeWhere} AND e.hire_date <= $3::date AND (e.termination_date IS NULL OR e.termination_date >= $2::date) ORDER BY e.employment_status,e.last_name,e.first_name`, params),
      this.rows(`SELECT s.id,s.name,s.starts_at,s.ends_at,b.name branch,d.name department,p.name position,s.required_headcount required,
        count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed')) assigned,
        greatest(s.required_headcount-count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed')),0) missing,
        CASE WHEN count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed'))=0 THEN 'unassigned' WHEN count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed'))<s.required_headcount THEN 'understaffed' WHEN count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed'))>s.required_headcount THEN 'overstaffed' ELSE 'staffed' END coverage_status
        FROM workforce.shifts s JOIN workforce.branches b ON b.id=s.branch_id LEFT JOIN workforce.departments d ON d.id=s.department_id LEFT JOIN workforce.positions p ON p.id=s.position_id LEFT JOIN workforce.shift_assignments sa ON sa.shift_id=s.id
        WHERE ${shiftWhere} AND s.status='published' GROUP BY s.id,b.name,d.name,p.name ORDER BY s.starts_at`, params),
      this.rows(`SELECT ar.id,ar.work_date::text work_date,ar.status,ar.actual_check_in_at check_in_at,ar.actual_check_out_at check_out_at,ar.scheduled_minutes,ar.worked_minutes,ar.break_minutes,coalesce(s.unpaid_break_minutes,0) allowed_break_minutes,ar.overtime_minutes,ar.late_minutes,ar.early_leave_minutes,
        concat(e.last_name,' ',e.first_name) employee,e.employee_code,b.name branch,coalesce(s.name,'Ngoài lịch') shift,
        count(DISTINCT ae.id) FILTER (WHERE ae.event_type='break_start') break_count,
        count(DISTINCT ae.id) FILTER (WHERE ae.latitude IS NOT NULL AND ae.longitude IS NOT NULL) gps_events,
        count(DISTINCT ae.id) FILTER (WHERE ae.photo_url IS NOT NULL) selfie_events,
        count(DISTINCT ae.id) FILTER (WHERE ae.is_within_geofence=false) outside_geofence_events,
        count(DISTINCT aar.id) adjustment_requests,
        coalesce((SELECT ae2.event_type='break_start' FROM workforce.attendance_events ae2 WHERE ae2.attendance_record_id=ar.id AND ae2.event_type IN ('break_start','break_end') ORDER BY ae2.occurred_at DESC LIMIT 1),false) break_open
        FROM workforce.attendance_records ar JOIN workforce.employees e ON e.id=ar.employee_id JOIN workforce.branches b ON b.id=ar.branch_id
        LEFT JOIN workforce.shift_assignments sa ON sa.id=ar.shift_assignment_id LEFT JOIN workforce.shifts s ON s.id=sa.shift_id
        LEFT JOIN workforce.attendance_events ae ON ae.attendance_record_id=ar.id LEFT JOIN workforce.attendance_adjustment_requests aar ON aar.attendance_record_id=ar.id
        WHERE ${employeeWhere} AND ar.work_date BETWEEN $2 AND $3
        GROUP BY ar.id,e.id,e.last_name,e.first_name,e.employee_code,b.name,s.id,s.name,s.unpaid_break_minutes ORDER BY ar.work_date DESC,employee`, params),
      this.rows(`SELECT av.id,av.violation_date::text violation_date,av.violation_type,av.minutes_affected,av.severity,av.status,concat(e.last_name,' ',e.first_name) employee,e.employee_code,b.name branch,d.name department
        FROM workforce.attendance_violations av JOIN workforce.employees e ON e.id=av.employee_id LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id
        WHERE ${employeeWhere} AND av.violation_date BETWEEN $2 AND $3 AND av.status IN ('active','provisional') ORDER BY av.violation_date DESC,av.severity DESC,employee`, params),
      this.rows(`SELECT lr.id,lr.starts_at,lr.ends_at,lr.requested_amount amount,lr.unit_snapshot unit,lr.is_paid_snapshot is_paid,lr.status,lr.requested_at,lr.reviewed_at,
        concat(e.last_name,' ',e.first_name) employee,e.employee_code,lt.name leave_type,b.name branch,d.name department
        FROM workforce.leave_requests lr JOIN workforce.employees e ON e.id=lr.employee_id JOIN workforce.leave_types lt ON lt.id=lr.leave_type_id LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id
        WHERE ${employeeWhere} AND lr.starts_at < $3::date + interval '1 day' AND lr.ends_at >= $2::date ORDER BY lr.starts_at DESC,employee`, params),
      this.rows(`SELECT t.id,tp.name period,tp.starts_on::text starts_on,tp.ends_on::text ends_on,t.status,t.scheduled_minutes,t.worked_minutes,t.break_minutes,t.regular_minutes,t.overtime_minutes,t.paid_leave_minutes,t.unpaid_leave_minutes,
        concat(e.last_name,' ',e.first_name) employee,e.employee_code,b.name branch,d.name department,(SELECT count(*) FROM workforce.timesheet_adjustments ta WHERE ta.timesheet_id=t.id) adjustments
        FROM workforce.timesheets t JOIN workforce.timesheet_periods tp ON tp.id=t.period_id JOIN workforce.employees e ON e.id=t.employee_id LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id
        WHERE ${employeeWhere} AND tp.starts_on <= $3 AND tp.ends_on >= $2 ORDER BY tp.starts_on DESC,employee`, params),
      canViewPayroll ? this.rows(`SELECT ep.id,pp.name period,pp.starts_on::text starts_on,pp.ends_on::text ends_on,ep.status,ep.currency_code,ep.base_salary,ep.regular_pay,ep.overtime_pay,ep.holiday_pay,ep.allowance_total,ep.bonus_total,ep.deduction_total,ep.gross_pay,ep.net_pay,ep.paid_total,ep.balance_due,
        concat(e.last_name,' ',e.first_name) employee,e.employee_code,b.name branch,d.name department
        FROM workforce.employee_payrolls ep JOIN workforce.payroll_periods pp ON pp.id=ep.payroll_period_id JOIN workforce.employees e ON e.id=ep.employee_id LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id
        WHERE ${employeeWhere} AND pp.starts_on <= $3 AND pp.ends_on >= $2 ORDER BY pp.starts_on DESC,employee`, params) : Promise.resolve([]),
      this.rows(`SELECT e.id,e.employee_code,concat(e.last_name,' ',e.first_name) employee,b.name branch,d.name department,
        coalesce((SELECT sum(ar.overtime_minutes) FROM workforce.attendance_records ar WHERE ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3),0) candidate_minutes,
        coalesce((SELECT sum(t.overtime_minutes) FROM workforce.timesheets t JOIN workforce.timesheet_periods tp ON tp.id=t.period_id WHERE t.employee_id=e.id AND tp.starts_on <= $3 AND tp.ends_on >= $2),0) confirmed_minutes,
        coalesce((SELECT sum(ep.overtime_pay) FROM workforce.employee_payrolls ep JOIN workforce.payroll_periods pp ON pp.id=ep.payroll_period_id WHERE ep.employee_id=e.id AND pp.starts_on <= $3 AND pp.ends_on >= $2),0) overtime_pay
        FROM workforce.employees e LEFT JOIN workforce.branches b ON b.id=e.primary_branch_id LEFT JOIN workforce.departments d ON d.id=e.department_id WHERE ${employeeWhere}
        AND (EXISTS(SELECT 1 FROM workforce.attendance_records ar WHERE ar.employee_id=e.id AND ar.work_date BETWEEN $2 AND $3 AND ar.overtime_minutes>0) OR EXISTS(SELECT 1 FROM workforce.timesheets t JOIN workforce.timesheet_periods tp ON tp.id=t.period_id WHERE t.employee_id=e.id AND tp.starts_on <= $3 AND tp.ends_on >= $2 AND t.overtime_minutes>0)) ORDER BY confirmed_minutes DESC,employee`, params),
    ]);
    const dataState = Number(timesheets.total) > 0 && Number(timesheets.locked) === Number(timesheets.total) ? 'locked_timesheet' : Number(timesheets.total) > 0 ? 'provisional' : 'live';
    return {
      generatedAt: new Date(), range, dataState, currency: organization.currency_code,
      employees: this.numeric(employees), schedule: this.numeric(schedule), attendance: this.numeric(attendance),
      anomalies: anomalies.map((row) => this.numeric(row)), leave: this.numeric(leave), timesheets: this.numeric(timesheets), payroll: this.numeric(payroll),
      trend: this.aggregateTrend(trend.map((row) => this.numeric(row)) as Array<{ key: string; planned: number; actual: number }>, range.interval),
      dimensions: dimensions.map((row) => this.numeric(row)), performance: performance.map((row) => this.numeric(row)), options,
      employeeRows: employeeRows.map((row) => this.numeric(row)), scheduleRows: scheduleRows.map((row) => this.numeric(row)),
      attendanceRows: attendanceRows.map((row) => this.numeric(row)), anomalyRows: anomalyRows.map((row) => this.numeric(row)),
      leaveRows: leaveRows.map((row) => this.numeric(row)), timesheetRows: timesheetRows.map((row) => this.numeric(row)),
      payrollRows: payrollRows.map((row) => this.numeric(row)), overtimeRows: overtimeRows.map((row) => {
        const item = this.numeric(row);
        return canViewPayroll ? item : { ...item, overtime_pay: 0 };
      }),
    };
  }

  async export(query: ReportExportQueryDto, actor: AuthUser) {
    if (query.report === 'payroll' && !actor.permissions.includes('payroll.view')) {
      throw new ForbiddenException('Bạn không có quyền xuất báo cáo tiền lương');
    }
    const report = await this.overview(query, actor);
    const title = `bao-cao-${query.report ?? 'tong-quan'}-${query.from}-${query.to}`;
    const rows = this.exportRows(report, query.report ?? 'overview');
    await this.dataSource.query(`INSERT INTO workforce.audit_logs(actor_user_id,action,entity_type,entity_id,new_values) VALUES($1,'report.exported','report',$2,$3::jsonb)`, [actor.id, query.report ?? 'overview', JSON.stringify({ format: query.format, from: query.from, to: query.to })]);
    if (query.format === 'csv') return { filename: `${title}.csv`, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(`\ufeff${this.csv(rows)}`) };
    if (query.format === 'xls') return { filename: `${title}.xls`, contentType: 'application/vnd.ms-excel; charset=utf-8', buffer: Buffer.from(`\ufeff${this.tsv(rows)}`) };
    return { filename: `${title}.pdf`, contentType: 'application/pdf', buffer: this.pdf(title, rows) };
  }

  private range(query: ReportQueryDto) { const from = new Date(`${query.from}T00:00:00Z`); const to = new Date(`${query.to}T00:00:00Z`); if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new BadRequestException('Khoảng thời gian không hợp lệ'); if ((to.getTime()-from.getTime())/86400000 > 366) throw new BadRequestException('Khoảng báo cáo tối đa 366 ngày'); return { from: query.from, to: query.to, interval: query.interval ?? 'day' }; }
  private async organization(actor: AuthUser) { const [row] = await this.dataSource.query(`SELECT o.id,o.currency_code FROM workforce.organizations o LEFT JOIN workforce.employees e ON e.organization_id=o.id AND e.id=$1 ORDER BY (e.id IS NOT NULL) DESC,o.created_at LIMIT 1`, [actor.employeeId]); if (!row) throw new BadRequestException('Chưa có dữ liệu doanh nghiệp'); return row; }
  private scope(actor: AuthUser, query: ReportQueryDto) { const unrestricted = actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'HR', 'PAYROLL'].includes(role.code)); const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER'); const allowedBranches = [...new Set(managerRoles.flatMap((role) => role.branchId ? [role.branchId] : []))]; const allowedDepartments = [...new Set(managerRoles.flatMap((role) => role.departmentId ? [role.departmentId] : []))]; const branchIds = query.branchId ? [query.branchId] : unrestricted ? null : allowedBranches.length ? allowedBranches : allowedDepartments.length ? null : []; const departmentIds = query.departmentId ? [query.departmentId] : unrestricted ? null : allowedDepartments.length ? allowedDepartments : allowedBranches.length ? null : []; if (!unrestricted && query.branchId && !allowedBranches.includes(query.branchId)) throw new BadRequestException('Chi nhánh nằm ngoài phạm vi báo cáo'); if (!unrestricted && query.departmentId && !allowedDepartments.includes(query.departmentId)) throw new BadRequestException('Phòng ban nằm ngoài phạm vi báo cáo'); return { branchIds, departmentIds }; }
  private async one(sql: string, params: unknown[]) { return (await this.dataSource.query(sql, params))[0] ?? {}; }
  private rows(sql: string, params: unknown[]): Promise<Row[]> { return this.dataSource.query(sql, params); }
  private numeric(row: Row) { return Object.fromEntries(Object.entries(row).map(([key,value]) => {
    if (value instanceof Date) return [key, value.toISOString()];
    if (typeof value === 'boolean' || typeof value === 'number' || value === null) return [key, value];
    return [key, value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value];
  })); }
  private exportRows(report: Awaited<ReturnType<ReportsService['overview']>>, type: string): Row[] {
    const details: Record<string, Row[]> = {
      employees: report.employeeRows as Row[],
      schedule: report.scheduleRows as Row[],
      hours: report.performance as Row[],
      attendance: report.attendanceRows as Row[],
      breaks: report.attendanceRows as Row[],
      overtime: report.overtimeRows as Row[],
      anomalies: report.anomalyRows as Row[],
      leave: report.leaveRows as Row[],
      timesheets: report.timesheetRows as Row[],
      payroll: report.payrollRows as Row[],
      performance: report.performance as Row[],
      'plan-actual': report.trend as Row[],
      period: report.trend as Row[],
    };
    if (details[type]) return details[type];
    if (['branches', 'departments', 'positions'].includes(type)) {
      const kind = type === 'branches' ? 'branch' : type === 'departments' ? 'department' : 'position';
      return report.dimensions.filter((row) => row.kind === kind) as Row[];
    }
    return Object.entries({ ...report.employees, ...report.schedule, ...report.attendance }).map(([metric, value]) => ({ metric, value: value as Row[string] }));
  }
  private csv(rows: Row[]) { if (!rows.length) return 'Không có dữ liệu'; const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]; const cell=(value: unknown)=>`"${String(value ?? '').replace(/"/g,'""')}"`; return [headers.map(cell).join(','),...rows.map((row)=>headers.map((key)=>cell(row[key])).join(','))].join('\n'); }
  private tsv(rows: Row[]) { if (!rows.length) return 'Không có dữ liệu'; const headers=[...new Set(rows.flatMap((row)=>Object.keys(row)))]; return [headers.join('\t'),...rows.map((row)=>headers.map((key)=>String(row[key]??'').replace(/[\t\n]/g,' ')).join('\t'))].join('\n'); }
  private pdf(title: string, rows: Row[]) { const lines=[title,`Thời điểm xuất: ${new Date().toISOString()}`,...rows.slice(0,45).map((row)=>Object.values(row).join(' | '))]; const escape=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?').replace(/[()\\]/g,'\\$&'); const content=`BT /F1 10 Tf 40 800 Td ${lines.map((line,index)=>`${index?'0 -16 Td ':''}(${escape(line)}) Tj`).join(' ')} ET`; const objects=[`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`,`2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`,`3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj`,`4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,`5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`]; let pdf='%PDF-1.4\n'; const offsets=[0]; for(const object of objects){offsets.push(Buffer.byteLength(pdf));pdf+=`${object}\n`;} const xref=Buffer.byteLength(pdf); pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map((offset)=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf); }
  private aggregateTrend(rows: Array<{ key: string; planned: number; actual: number }>, interval: string) { if (interval === 'day') return rows; const result = new Map<string,{key:string;planned:number;actual:number}>(); for (const row of rows) { const date = new Date(`${row.key}T12:00:00Z`); if (interval === 'week') { const day=(date.getUTCDay()+6)%7; date.setUTCDate(date.getUTCDate()-day); } else date.setUTCDate(1); const key=date.toISOString().slice(0,10); const current=result.get(key)??{key,planned:0,actual:0}; current.planned+=row.planned; current.actual+=row.actual; result.set(key,current); } return [...result.values()]; }
}
