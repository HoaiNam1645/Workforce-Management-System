import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { AuthUser } from './auth-user.type';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { LoginDto } from './dto/login.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Controller()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.accessControlService.login(dto);
  }

  @Get('auth/me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('access-control/matrix')
  @RequirePermissions('access.view')
  getPermissionMatrix() {
    return this.accessControlService.getPermissionMatrix();
  }

  @Put('access-control/roles/:id/permissions')
  @RequirePermissions('access.manage')
  updateRolePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accessControlService.updateRolePermissions(id, dto, user);
  }
}
