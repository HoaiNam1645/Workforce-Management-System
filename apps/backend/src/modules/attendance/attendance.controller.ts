import { Body, Controller, Get, Header, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AttendanceService, type AttendanceSelfieFile } from './attendance.service';
import { AttendanceHistoryQueryDto, CreateAttendanceAdjustmentDto, LiveShiftQueryDto, ReviewAttendanceAdjustmentDto } from './dto/attendance-history.dto';
import { ClockActionDto, UpdateBranchGeofenceDto } from './dto/clock-action.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
