import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { AssignEmployeesDto } from './dto/assign-employees.dto';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { ShiftCandidateQueryDto } from './dto/shift-candidate-query.dto';
import { ShiftQueryDto } from './dto/shift-query.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';
import { RepeatShiftDto } from './dto/repeat-shift.dto';
import { CopyScheduleDto } from './dto/copy-schedule.dto';
import { PublishScheduleDto, ScheduleRangeDto } from './dto/schedule-range.dto';
import { ApplyScheduleTemplateDto, CreateScheduleTemplateDto, SaveScheduleTemplateFromRangeDto } from './dto/schedule-template.dto';
import { SchedulesService } from './schedules.service';
import { ShiftSwapsService } from './shift-swaps.service';
import { CreateShiftSwapDto, ShiftSwapActionDto, ShiftSwapQueryDto } from './dto/shift-swap.dto';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService, private readonly shiftSwapsService: ShiftSwapsService) {}

  @Get('shift-swaps/options')
  @RequirePermissions('shift_swaps.request')
  getShiftSwapOptions(@CurrentUser() user: AuthUser) { return this.shiftSwapsService.getOptions(user); }

  @Get('shift-swaps/mine')
  @RequirePermissions('shift_swaps.request')
  getMyShiftSwaps(@Query() query: ShiftSwapQueryDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.findMine(query, user); }

  @Get('shift-swaps/review')
  @RequirePermissions('shift_swaps.approve')
  getShiftSwapsForReview(@Query() query: ShiftSwapQueryDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.findForReview(query, user); }

  @Post('shift-swaps')
  @RequirePermissions('shift_swaps.request')
  createShiftSwap(@Body() dto: CreateShiftSwapDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.create(dto, user); }

  @Patch('shift-swaps/:id/accept')
  @RequirePermissions('shift_swaps.request')
  acceptShiftSwap(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftSwapActionDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.respond(id, true, dto, user); }

  @Patch('shift-swaps/:id/decline')
  @RequirePermissions('shift_swaps.request')
  declineShiftSwap(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftSwapActionDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.respond(id, false, dto, user); }

  @Patch('shift-swaps/:id/approve')
  @RequirePermissions('shift_swaps.approve')
  approveShiftSwap(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftSwapActionDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.review(id, true, dto, user); }

  @Patch('shift-swaps/:id/reject')
  @RequirePermissions('shift_swaps.approve')
  rejectShiftSwap(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftSwapActionDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.review(id, false, dto, user); }

  @Patch('shift-swaps/:id/cancel')
  @RequirePermissions('shift_swaps.request')
  cancelShiftSwap(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ShiftSwapActionDto, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.cancel(id, dto, user); }

  @Get('shift-swaps/:id/history')
  @RequirePermissions('shift_swaps.request')
  getShiftSwapHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.shiftSwapsService.history(id, user); }

  @Get('options')
  @RequirePermissions('schedules.view')
  getOptions(@CurrentUser() user: AuthUser) {
    return this.schedulesService.getOptions(user);
  }

  @Get('shift-templates')
  @RequirePermissions('schedules.view')
  getShiftTemplates(@CurrentUser() user: AuthUser) {
    return this.schedulesService.getShiftTemplates(user);
  }

  @Post('shift-templates')
  @RequirePermissions('schedules.templates.manage')
  createShiftTemplate(@Body() dto: CreateShiftTemplateDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.createShiftTemplate(dto, user);
  }

  @Patch('shift-templates/:id')
  @RequirePermissions('schedules.templates.manage')
  updateShiftTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftTemplateDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.updateShiftTemplate(id, dto, user);
  }

  @Delete('shift-templates/:id')
  @HttpCode(200)
  @RequirePermissions('schedules.templates.manage')
  removeShiftTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.removeShiftTemplate(id, user);
  }

  @Get('schedule-templates')
  @RequirePermissions('schedules.view')
  getScheduleTemplates(@CurrentUser() user: AuthUser) {
    return this.schedulesService.getScheduleTemplates(user);
  }

  @Post('schedule-templates')
  @RequirePermissions('schedules.templates.manage')
  createScheduleTemplate(@Body() dto: CreateScheduleTemplateDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.createScheduleTemplate(dto, user);
  }

  @Post('schedule-templates/from-range')
  @RequirePermissions('schedules.templates.manage')
  saveScheduleTemplateFromRange(@Body() dto: SaveScheduleTemplateFromRangeDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.saveScheduleTemplateFromRange(dto, user);
  }

  @Post('schedule-templates/:id/apply')
  @RequirePermissions('schedules.manage')
  applyScheduleTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyScheduleTemplateDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.applyScheduleTemplate(id, dto, user);
  }

  @Post('copy')
  @RequirePermissions('schedules.manage')
  copySchedule(@Body() dto: CopyScheduleDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.copySchedule(dto, user);
  }

  @Post('validate')
  @RequirePermissions('schedules.view')
  validateSchedule(@Body() dto: ScheduleRangeDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.validateSchedule(dto, user);
  }

  @Post('publish')
  @RequirePermissions('schedules.publish')
  publishSchedule(@Body() dto: PublishScheduleDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.publishSchedule(dto, user);
  }

  @Get('my-schedule')
  @RequirePermissions('schedules.self.view')
  getMySchedule(@Query() query: ScheduleRangeDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.getMySchedule(query, user);
  }

  @Get('my-schedule/:id')
  @RequirePermissions('schedules.self.view')
  getMyShiftDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.getMyShiftDetail(id, user);
  }

  @Get('grid')
  @RequirePermissions('schedules.view')
  getEmployeeGrid(@Query() query: ShiftQueryDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.getEmployeeGrid(query, user);
  }

  @Get('shifts')
  @RequirePermissions('schedules.view')
  findAll(@Query() query: ShiftQueryDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.findAll(query, user);
  }

  @Get('shifts/:id')
  @RequirePermissions('schedules.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.findOne(id, user);
  }

  @Get('shifts/:id/assignments')
  @RequirePermissions('schedules.view')
  getAssignments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.getShiftAssignments(id, user);
  }

  @Get('shifts/:id/candidates')
  @RequirePermissions('schedules.view')
  getCandidates(@Param('id', ParseUUIDPipe) id: string, @Query() query: ShiftCandidateQueryDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.getShiftCandidates(id, user, query.search);
  }

  @Post('shifts/:id/repeat')
  @RequirePermissions('schedules.manage')
  repeatShift(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RepeatShiftDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.repeatShift(id, dto, user);
  }

  @Post('shifts/:id/assignments')
  @RequirePermissions('schedules.assign')
  assignEmployees(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignEmployeesDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.assignEmployees(id, dto, user);
  }

  @Delete('shifts/:id/assignments/:assignmentId')
  @HttpCode(200)
  @RequirePermissions('schedules.assign')
  removeAssignment(@Param('id', ParseUUIDPipe) id: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.removeAssignment(id, assignmentId, user);
  }

  @Post('shifts')
  @RequirePermissions('schedules.manage')
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.schedulesService.create(dto, user);
  }

  @Patch('shifts/:id')
  @RequirePermissions('schedules.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.schedulesService.update(id, dto, user);
  }

  @Delete('shifts/:id')
  @HttpCode(200)
  @RequirePermissions('schedules.manage')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedulesService.remove(id, user);
  }
}
