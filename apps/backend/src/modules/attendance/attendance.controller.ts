import { Body, Controller, Get, Header, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AttendanceService, type AttendanceSelfieFile } from './attendance.service';
import { AttendanceHistoryQueryDto, CreateAttendanceAdjustmentDto, LiveShiftQueryDto, ReviewAttendanceAdjustmentDto } from './dto/attendance-history.dto';
import { ClockActionDto, UpdateBranchGeofenceDto } from './dto/clock-action.dto';
import { AttendanceAnomalyService } from './attendance-anomaly.service';
import { AttendanceAnomalyQueryDto, ExcludeAttendanceAnomalyDto, UpdateAttendanceAnomalySettingsDto } from './dto/attendance-anomaly.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService, private readonly anomalyService: AttendanceAnomalyService) {}

  @Get('me/anomalies')
  @RequirePermissions('attendance_anomalies.self.view')
  getMyAnomalies(@Query() query: AttendanceAnomalyQueryDto, @CurrentUser() user: AuthUser) {
    return this.anomalyService.getMyAnomalies(query, user);
  }

  @Get('anomalies/options')
  @RequirePermissions('attendance_anomalies.view')
  getAnomalyOptions(@CurrentUser() user: AuthUser) {
    return this.anomalyService.getOptions(user);
  }

  @Get('anomalies/statistics')
  @RequirePermissions('attendance_anomalies.view')
  getAnomalyStatistics(@Query() query: AttendanceAnomalyQueryDto, @CurrentUser() user: AuthUser) {
    return this.anomalyService.getStatistics(query, user);
  }

  @Get('anomalies')
  @RequirePermissions('attendance_anomalies.view')
  getAnomalies(@Query() query: AttendanceAnomalyQueryDto, @CurrentUser() user: AuthUser) {
    return this.anomalyService.getOverview(query, user);
  }

  @Post('anomalies/recalculate-all')
  @RequirePermissions('attendance_anomalies.exclude')
  recalculateAllAnomalies() {
    return this.anomalyService.recalculateAll();
  }

  @Get('anomalies/:id')
  @RequirePermissions('attendance_anomalies.details.view')
  getAnomalyDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.anomalyService.getDetail(id, user);
  }

  @Post('anomalies/:id/recalculate')
  @RequirePermissions('attendance_anomalies.exclude')
  recalculateAnomaly(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.anomalyService.recalculate(id, user);
  }

  @Post('anomalies/:id/exclude')
  @RequirePermissions('attendance_anomalies.exclude')
  excludeAnomaly(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExcludeAttendanceAnomalyDto, @CurrentUser() user: AuthUser) {
    return this.anomalyService.exclude(id, dto.reason, user);
  }

  @Post('anomalies/:id/restore')
  @RequirePermissions('attendance_anomalies.exclude')
  restoreAnomaly(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.anomalyService.restore(id, user);
  }

  @Get('anomaly-settings')
  @RequirePermissions('attendance_anomalies.config.manage')
  getAnomalySettings() {
    return this.anomalyService.getSettings();
  }

  @Patch('anomaly-settings')
  @RequirePermissions('attendance_anomalies.config.manage')
  updateAnomalySettings(@Body() dto: UpdateAttendanceAnomalySettingsDto) {
    return this.anomalyService.updateSettings(dto);
  }

  @Get('me')
  @RequirePermissions('attendance.clock')
  getMyAttendance(@CurrentUser() user: AuthUser) {
    return this.attendanceService.getMyAttendance(user);
  }

  @Get('me/history')
  @RequirePermissions('attendance.clock')
  getMyHistory(@Query() query: AttendanceHistoryQueryDto, @CurrentUser() user: AuthUser) {
    return this.attendanceService.getMyHistory(query, user);
  }

  @Get('events/:id/selfie')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, max-age=300')
  async getEventSelfie(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return new StreamableFile(await this.attendanceService.getEventSelfie(id, user));
  }

  @Post('me/adjustments')
  @RequirePermissions('attendance.clock')
  requestAdjustment(@Body() dto: CreateAttendanceAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.attendanceService.requestAdjustment(dto, user);
  }

  @Post('me/check-in')
  @RequirePermissions('attendance.clock')
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  checkIn(
    @Body() dto: ClockActionDto,
    @UploadedFile() selfie: AttendanceSelfieFile | undefined,
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.attendanceService.checkIn(dto, user, { userAgent, ipAddress }, selfie);
  }

  @Post('me/check-out')
  @RequirePermissions('attendance.clock')
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  checkOut(
    @Body() dto: ClockActionDto,
    @UploadedFile() selfie: AttendanceSelfieFile | undefined,
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.attendanceService.checkOut(dto, user, { userAgent, ipAddress }, selfie);
  }

  @Post('me/breaks/start')
  @RequirePermissions('attendance.clock')
  startBreak(
    @Body() dto: ClockActionDto,
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.attendanceService.startBreak(dto, user, { userAgent, ipAddress });
  }

  @Post('me/breaks/end')
  @RequirePermissions('attendance.clock')
  endBreak(
    @Body() dto: ClockActionDto,
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.attendanceService.endBreak(dto, user, { userAgent, ipAddress });
  }

  @Get('adjustments')
  @RequirePermissions('attendance.adjust')
  getAdjustmentRequests(@CurrentUser() user: AuthUser) {
    return this.attendanceService.getAdjustmentRequests(user);
  }

  @Get('live-shifts')
  @RequirePermissions('attendance.view')
  getLiveShifts(@Query() query: LiveShiftQueryDto, @CurrentUser() user: AuthUser) {
    return this.attendanceService.getLiveShifts(query, user);
  }

  @Get('violations/late')
  @RequirePermissions('attendance.adjust')
  getLateViolations() {
    return this.attendanceService.getLateViolations();
  }

  @Get('violations/breaks')
  @RequirePermissions('attendance.adjust')
  getBreakViolations() {
    return this.attendanceService.getBreakViolations();
  }

  @Get('settings/branches')
  @RequirePermissions('attendance.adjust')
  getBranchGeofences() {
    return this.attendanceService.getBranchGeofences();
  }

  @Patch('settings/branches/:id/geofence')
  @RequirePermissions('attendance.adjust')
  updateBranchGeofence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchGeofenceDto) {
    return this.attendanceService.updateBranchGeofence(id, dto);
  }

  @Patch('adjustments/:id')
  @RequirePermissions('attendance.adjust')
  reviewAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAttendanceAdjustmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendanceService.reviewAdjustment(id, dto, user);
  }
}
