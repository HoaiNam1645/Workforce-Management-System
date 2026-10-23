import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AuthUser } from "../access-control/auth-user.type";
import { CurrentUser } from "../access-control/decorators/current-user.decorator";
import { RequirePermissions } from "../access-control/decorators/require-permissions.decorator";
import {
  AssignBranchManagerDto,
  BranchStatusDto,
  EndBranchManagerDto,
  GrantBranchScopeDto,
  MoveDepartmentDto,
  OrganizationQueryDto,
  SaveBranchDto,
  SaveDepartmentDto,
  SaveOperatingHoursDto,
  SaveOrganizationDto,
  SavePositionDto,
  SetBranchDepartmentsDto,
  RevokeBranchScopeDto,
} from "./dto/organization.dto";
import { OrganizationService } from "./organization.service";

@Controller("organization")
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Get("profile")
  @RequirePermissions("organization.view")
  profile() {
    return this.service.getProfile();
  }

  @Get("time-context")
  timeContext() {
    return this.service.getTimeContext();
  }

  @Post("profile")
  @RequirePermissions("branches.manage")
  createProfile(
    @Body() dto: SaveOrganizationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.createProfile(dto, actor);
  }

  @Patch("profile")
  @RequirePermissions("branches.manage")
  updateProfile(
    @Body() dto: SaveOrganizationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.updateProfile(dto, actor);
  }

  @Get("dashboard")
  @RequirePermissions("organization.view")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.service.getDashboard(actor);
  }

  @Get("geocode")
  @RequirePermissions("branches.geofence.manage")
  geocode(@Query("q") query: string) {
    return this.service.geocode(query);
  }

  @Get("resolve-timezone")
  @RequirePermissions("organization.view")
  resolveTimezone(@Query("q") query: string) {
    return this.service.resolveTimezone(query);
  }

  @Get("branches")
  @RequirePermissions("branches.view")
  branches(
    @Query() query: OrganizationQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.getBranches(query, actor);
  }
  @Post("branches")
  @RequirePermissions("branches.manage")
  createBranch(@Body() dto: SaveBranchDto, @CurrentUser() actor: AuthUser) {
    return this.service.createBranch(dto, actor);
  }
  @Get("branches/:id")
  @RequirePermissions("branches.view")
  branch(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.getBranch(id, actor);
  }
  @Patch("branches/:id")
  @RequirePermissions("branches.manage")
  updateBranch(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveBranchDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.updateBranch(id, dto, actor);
  }
  @Post("branches/:id/deactivate")
  @RequirePermissions("branches.manage")
  deactivateBranch(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changeBranchStatus(id, false, dto, actor);
  }
  @Post("branches/:id/reactivate")
  @RequirePermissions("branches.manage")
  reactivateBranch(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changeBranchStatus(id, true, dto, actor);
  }
  @Put("branches/:id/operating-hours")
  @RequirePermissions("branches.operating_hours.manage")
  saveHours(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveOperatingHoursDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.saveOperatingHours(id, dto, actor);
  }
  @Post("branches/:id/managers")
  @RequirePermissions("branches.managers.manage")
  assignManager(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignBranchManagerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.assignManager(id, dto, actor);
  }
  @Patch("branches/:id/managers/:assignmentId/end")
  @RequirePermissions("branches.managers.manage")
  endManager(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("assignmentId", ParseUUIDPipe) assignmentId: string,
    @Body() dto: EndBranchManagerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.endManager(id, assignmentId, dto, actor);
  }
  @Put("branches/:id/departments")
  @RequirePermissions("departments.manage")
  setDepartments(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetBranchDepartmentsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.setBranchDepartments(id, dto, actor);
  }

  @Post("branches/:id/scopes")
  @RequirePermissions("branches.scope.manage")
  grantScope(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GrantBranchScopeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.grantBranchScope(id, dto, actor);
  }

  @Delete("branches/:id/scopes/:scopeId")
  @RequirePermissions("branches.scope.manage")
  revokeScope(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("scopeId", ParseUUIDPipe) scopeId: string,
    @Body() dto: RevokeBranchScopeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.revokeBranchScope(id, scopeId, dto, actor);
  }

  @Get("departments")
  @RequirePermissions("departments.view")
  departments(
    @Query() query: OrganizationQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.getDepartments(query, actor);
  }
  @Post("departments")
  @RequirePermissions("departments.manage")
  createDepartment(
    @Body() dto: SaveDepartmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.createDepartment(dto, actor);
  }
  @Patch("departments/:id")
  @RequirePermissions("departments.manage")
  updateDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveDepartmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.updateDepartment(id, dto, actor);
  }
  @Post("departments/:id/move")
  @RequirePermissions("departments.manage")
  moveDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MoveDepartmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.moveDepartment(id, dto, actor);
  }
  @Post("departments/:id/deactivate")
  @RequirePermissions("departments.manage")
  deactivateDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changeDepartmentStatus(id, false, dto, actor);
  }
  @Post("departments/:id/reactivate")
  @RequirePermissions("departments.manage")
  reactivateDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changeDepartmentStatus(id, true, dto, actor);
  }

  @Get("positions")
  @RequirePermissions("positions.view")
  positions(
    @Query() query: OrganizationQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.getPositions(query, actor);
  }
  @Post("positions")
  @RequirePermissions("positions.manage")
  createPosition(@Body() dto: SavePositionDto, @CurrentUser() actor: AuthUser) {
    return this.service.createPosition(dto, actor);
  }
  @Patch("positions/:id")
  @RequirePermissions("positions.manage")
  updatePosition(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SavePositionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.updatePosition(id, dto, actor);
  }
  @Post("positions/:id/deactivate")
  @RequirePermissions("positions.manage")
  deactivatePosition(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changePositionStatus(id, false, dto, actor);
  }
  @Post("positions/:id/reactivate")
  @RequirePermissions("positions.manage")
  reactivatePosition(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BranchStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.changePositionStatus(id, true, dto, actor);
  }
}
