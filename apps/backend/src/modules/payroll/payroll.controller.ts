import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CreatePayrollItemDto, CreatePayrollPeriodDto, CreatePayrollRuleDto, CreateSalaryRateDto, PayrollActionDto, PayrollListQueryDto, RecordPayrollPaymentDto, ReversePayrollPaymentDto, UpdatePayrollRuleDto } from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('salary-rates') @RequirePermissions('employees.salary.view')
  getSalaryRates(@Query() query: PayrollListQueryDto, @CurrentUser() user: AuthUser) { return this.payrollService.getSalaryRates(query, user); }

  @Post('salary-rates') @RequirePermissions('employees.salary.manage')
  createSalaryRate(@Body() dto: CreateSalaryRateDto, @CurrentUser() user: AuthUser) { return this.payrollService.createSalaryRate(dto, user); }

  @Get('salary-rates/:employeeId/history') @RequirePermissions('employees.salary.view')
  getSalaryHistory(@Param('employeeId', ParseUUIDPipe) employeeId: string, @CurrentUser() user: AuthUser) { return this.payrollService.getSalaryHistory(employeeId, user); }

  @Get('rules') @RequirePermissions('payroll.view')
  getRules(@CurrentUser() user: AuthUser) { return this.payrollService.getRules(user); }

  @Post('rules') @RequirePermissions('payroll.calculate')
  createRule(@Body() dto: CreatePayrollRuleDto, @CurrentUser() user: AuthUser) { return this.payrollService.createRule(dto, user); }

  @Patch('rules/:id') @RequirePermissions('payroll.calculate')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollRuleDto, @CurrentUser() user: AuthUser) { return this.payrollService.updateRule(id, dto, user); }

  @Get('me/payslips') @RequirePermissions('payroll.self.view')
  getMyPayslips(@CurrentUser() user: AuthUser) { return this.payrollService.getMyPayslips(user); }

  @Get('me/payslips/:id') @RequirePermissions('payroll.self.view')
  getMyPayslip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.payrollService.getMyPayslip(id, user); }

  @Get('periods') @RequirePermissions('payroll.view')
  getPeriods(@Query() query: PayrollListQueryDto, @CurrentUser() user: AuthUser) { return this.payrollService.getPeriods(query, user); }

  @Post('periods') @RequirePermissions('payroll.calculate')
  createPeriod(@Body() dto: CreatePayrollPeriodDto, @CurrentUser() user: AuthUser) { return this.payrollService.createPeriod(dto, user); }

  @Get('periods/:id/export') @Header('Content-Type', 'text/csv; charset=utf-8') @RequirePermissions('payroll.export')
  async exportPeriod(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return new StreamableFile(Buffer.from(await this.payrollService.exportPeriod(id, user), 'utf8')); }

  @Get('periods/:id') @RequirePermissions('payroll.view')
  getPeriod(@Param('id', ParseUUIDPipe) id: string, @Query() query: PayrollListQueryDto, @CurrentUser() user: AuthUser) { return this.payrollService.getPeriod(id, query, user); }

  @Post('periods/:id/calculate') @RequirePermissions('payroll.calculate')
  calculate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.payrollService.calculatePeriod(id, user); }

  @Post('periods/:id/submit') @RequirePermissions('payroll.calculate')
  submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayrollActionDto, @CurrentUser() user: AuthUser) { return this.payrollService.submitPeriod(id, dto, user); }

  @Post('periods/:id/approve') @RequirePermissions('payroll.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayrollActionDto, @CurrentUser() user: AuthUser) { return this.payrollService.approvePeriod(id, dto, user); }

  @Post('periods/:id/return') @RequirePermissions('payroll.approve')
  returnPeriod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayrollActionDto, @CurrentUser() user: AuthUser) { return this.payrollService.returnPeriod(id, dto, user); }

  @Post('periods/:id/lock') @RequirePermissions('payroll.lock')
  lock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayrollActionDto, @CurrentUser() user: AuthUser) { return this.payrollService.lockPeriod(id, dto, user); }

  @Post('periods/:id/unlock') @RequirePermissions('payroll.unlock')
  unlock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayrollActionDto, @CurrentUser() user: AuthUser) { return this.payrollService.unlockPeriod(id, dto, user); }

  @Get('employee-payrolls/:id') @RequirePermissions('payroll.view')
  getEmployeePayroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.payrollService.getEmployeePayroll(id, user); }

  @Post('employee-payrolls/:id/items') @RequirePermissions('payroll.items.manage')
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePayrollItemDto, @CurrentUser() user: AuthUser) { return this.payrollService.addItem(id, dto, user); }

  @Patch('employee-payrolls/:id/items/:itemId') @RequirePermissions('payroll.items.manage')
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: CreatePayrollItemDto, @CurrentUser() user: AuthUser) { return this.payrollService.updateItem(id, itemId, dto, user); }

  @Delete('employee-payrolls/:id/items/:itemId') @RequirePermissions('payroll.items.manage')
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @CurrentUser() user: AuthUser) { return this.payrollService.deleteItem(id, itemId, user); }

  @Post('employee-payrolls/:id/payments') @RequirePermissions('payroll.payment.record')
  recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPayrollPaymentDto, @CurrentUser() user: AuthUser) { return this.payrollService.recordPayment(id, dto, user); }

  @Post('employee-payrolls/:id/payments/:paymentId/reverse') @RequirePermissions('payroll.payment.record')
  reversePayment(@Param('id', ParseUUIDPipe) id: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() dto: ReversePayrollPaymentDto, @CurrentUser() user: AuthUser) { return this.payrollService.reversePayment(id, paymentId, dto, user); }
}
