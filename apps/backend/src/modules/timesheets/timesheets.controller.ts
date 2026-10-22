import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { TimesheetReportQueryDto } from './dto/timesheet-report-query.dto';
import { AdjustTimesheetDto, GenerateTimesheetsDto, TimesheetActionDto } from './dto/timesheet-actions.dto';
import { TimesheetsService } from './timesheets.service';

@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get()
  @RequirePermissions('timesheets.view')
  getReport(@Query() query: TimesheetReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.getReport(query, user);
  }

  @Post('generate')
  @RequirePermissions('timesheets.adjust')
  generate(@Body() dto: GenerateTimesheetsDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.generate(dto, user);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bang-cong.csv"')
  @RequirePermissions('timesheets.export')
  async export(@Query() query: TimesheetReportQueryDto, @CurrentUser() user: AuthUser) {
    return new StreamableFile(Buffer.from(await this.timesheetsService.exportCsv(query, user), 'utf8'));
  }

  @Get(':id/history')
  @RequirePermissions('timesheets.view')
  getHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.getHistory(id, user);
  }

  @Patch(':id/adjust')
  @RequirePermissions('timesheets.adjust')
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustTimesheetDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.adjust(id, dto, user);
  }

  @Patch(':id/approve')
  @RequirePermissions('timesheets.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TimesheetActionDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.approve(id, dto, user);
  }

  @Patch(':id/return')
  @RequirePermissions('timesheets.approve')
  returnTimesheet(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TimesheetActionDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.returnTimesheet(id, dto, user);
  }

  @Patch(':id/lock')
  @RequirePermissions('timesheets.lock')
  lock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TimesheetActionDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.lock(id, dto, user);
  }

  @Patch(':id/unlock')
  @RequirePermissions('timesheets.unlock')
  unlock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TimesheetActionDto, @CurrentUser() user: AuthUser) {
    return this.timesheetsService.unlock(id, dto, user);
  }
}
