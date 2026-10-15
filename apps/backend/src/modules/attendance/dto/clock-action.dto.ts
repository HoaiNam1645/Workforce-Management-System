import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ClockActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  locationAccuracyM?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outsideScheduleReason?: string;

}

export class UpdateBranchGeofenceDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsInt()
  @Min(20)
  @Max(5000)
  radiusM!: number;
}
