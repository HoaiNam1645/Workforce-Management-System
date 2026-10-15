import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateSalaryRateDto } from './dto/create-salary-rate.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';
import { EmployeesService } from './employees.service';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { AuthUser } from '../access-control/auth-user.type';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('employees.view')
  findAll(@Query() query: EmployeeQueryDto) {
    return this.employeesService.findAll(query);
  }

  @Get('summary')
  @RequirePermissions('employees.view')
  getSummary(
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId?: string,
  ) {
    return this.employeesService.getSummary(organizationId);
  }

  @Get('options')
  @RequirePermissions('employees.view')
  getOptions(
    @CurrentUser() user: AuthUser,
    @Query('organizationId', new ParseUUIDPipe({ optional: true })) organizationId?: string,
  ) {
    return this.employeesService.getOptions(organizationId, user);
  }

  @Get(':id')
  @RequirePermissions('employees.view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  @Get(':id/work-history')
  @RequirePermissions('employees.history.view')
  getWorkHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.getWorkHistory(id);
  }

  @Get(':id/salary-rates')
  @RequirePermissions('employees.salary.view')
  getSalaryRates(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.getSalaryRates(id);
  }

  @Post(':id/salary-rates')
  @RequirePermissions('employees.salary.manage')
  createSalaryRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSalaryRateDto,
  ) {
    return this.employeesService.createSalaryRate(id, dto);
  }

  @Get(':id/access')
  @RequirePermissions('employees.access.manage')
  getAccess(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.employeesService.getAccess(id, user);
  }

  @Patch(':id/access')
  @RequirePermissions('employees.access.manage')
  updateAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeAccessDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.updateAccess(id, dto, user);
  }

  @Post()
  @RequirePermissions('employees.create')
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employeesService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('employees.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('employees.update')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeStatusDto,
  ) {
    return this.employeesService.updateStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('employees.delete')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.remove(id);
  }
}
