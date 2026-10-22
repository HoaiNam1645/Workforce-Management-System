import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class OrganizationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["active", "inactive", "all"]) status?: string;
  @IsOptional() @IsIn(["configured", "missing", "all"]) gps?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class SaveBranchDto {
  @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsString() @MinLength(3) @MaxLength(1000) addressLine!: string;
  @IsOptional() @IsString() @MaxLength(120) ward?: string | null;
  @IsOptional() @IsString() @MaxLength(120) district?: string | null;
  @IsOptional() @IsString() @MaxLength(120) province?: string | null;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string | null;
  @IsIn([
    "head_office",
    "office",
    "store",
    "factory",
    "warehouse",
    "project_site",
    "other",
  ])
  branchType!: string;
  @IsString() @MaxLength(64) timezone!: string;
  @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number | null;
  @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number | null;
  @IsBoolean() geofenceEnabled!: boolean;
  @Type(() => Number) @IsInt() @Min(20) @Max(5000) geofenceRadiusM!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5000) locationAccuracyM!: number;
  @IsBoolean() isHeadOffice!: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}

export class BranchStatusDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class OperatingHourDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsBoolean() isClosed!: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/) opensAt?:
    | string
    | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/) closesAt?:
    | string
    | null;
  @IsOptional() @IsBoolean() spansNextDay?: boolean;
}

export class OperatingExceptionDto {
  @IsOptional() @IsUUID() id?: string;
  @IsDateString() exceptionDate!: string;
  @IsBoolean() isClosed!: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/) opensAt?:
    | string
    | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/) closesAt?:
    | string
    | null;
  @IsOptional() @IsBoolean() spansNextDay?: boolean;
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class SaveOperatingHoursDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OperatingHourDto)
  hours!: OperatingHourDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OperatingExceptionDto)
  exceptions?: OperatingExceptionDto[];
}

export class AssignBranchManagerDto {
  @IsUUID() employeeId!: string;
  @IsString() @MinLength(2) @MaxLength(120) responsibility!: string;
  @IsBoolean() isPrimary!: boolean;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsBoolean() grantManagerScope?: boolean;
}

export class EndBranchManagerDto {
  @IsDateString() effectiveTo!: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  @IsOptional() @IsBoolean() revokeManagerScope?: boolean;
}

export class SetBranchDepartmentsDto {
  @IsArray() @IsUUID(undefined, { each: true }) departmentIds!: string[];
}

export class GrantBranchScopeDto {
  @IsUUID() userId!: string;
  @IsIn(["MANAGER"]) roleCode!: string;
}

export class RevokeBranchScopeDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class SaveDepartmentDto {
  @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  branchIds?: string[];
}

export class MoveDepartmentDto {
  @IsOptional() @IsUUID() parentId?: string | null;
}

export class SavePositionDto {
  @IsString() @MinLength(2) @MaxLength(30) code!: string;
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsBoolean() isManager!: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  departmentIds?: string[];
}
