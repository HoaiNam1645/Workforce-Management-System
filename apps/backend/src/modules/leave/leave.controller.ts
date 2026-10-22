import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CreateLeaveEntitlementPolicyDto, UpdateLeaveEntitlementPolicyDto } from './dto/leave-entitlement-policy.dto';
import { AdjustLeaveBalanceDto, LeaveBalanceQueryDto } from './dto/leave-balance.dto';
import { CreateLeaveRequestDto } from './dto/leave-request.dto';
import { CreateLeaveTypeDto, LeaveTypeQueryDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { LeaveService } from './leave.service';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('balances/options')
  @RequirePermissions('leave_balances.view')
  getBalanceOptions(@CurrentUser() user: AuthUser) {
    return this.leaveService.getBalanceOptions(user);
  }

  @Get('balances')
  @RequirePermissions('leave_balances.view')
  findBalances(@Query() query: LeaveBalanceQueryDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.findBalances(query, user);
  }

  @Get('balances/:id/ledger')
  @RequirePermissions('leave_balances.view')
  getBalanceLedger(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.leaveService.getBalanceLedger(id, user);
  }

  @Post('balances/adjust')
  @RequirePermissions('leave_balances.adjust')
  adjustBalance(@Body() dto: AdjustLeaveBalanceDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.adjustBalance(dto, user);
  }

  @Get('my')
  @RequirePermissions('leave.request')
  getMyLeave(@CurrentUser() user: AuthUser) {
    return this.leaveService.getMyLeave(user);
  }

  @Post('requests/preview')
  @HttpCode(200)
  @RequirePermissions('leave.request')
  previewRequest(@Body() dto: CreateLeaveRequestDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.previewRequest(dto, user);
  }

  @Post('requests')
  @RequirePermissions('leave.request')
  createRequest(@Body() dto: CreateLeaveRequestDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.createRequest(dto, user);
  }

  @Get('types')
  @RequirePermissions('leave_types.view')
  findTypes(@Query() query: LeaveTypeQueryDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.findTypes(query, user);
  }

  @Post('types')
  @RequirePermissions('leave_types.manage')
  createType(@Body() dto: CreateLeaveTypeDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.createType(dto, user);
  }

  @Patch('types/:id')
  @RequirePermissions('leave_types.manage')
  updateType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.updateType(id, dto, user);
  }

  @Post('types/:id/entitlement-policies')
  @RequirePermissions('leave_entitlements.manage')
  createPolicy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLeaveEntitlementPolicyDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.createPolicy(id, dto, user);
  }

  @Patch('entitlement-policies/:id')
  @RequirePermissions('leave_entitlements.manage')
  updatePolicy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveEntitlementPolicyDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.updatePolicy(id, dto, user);
  }
}
