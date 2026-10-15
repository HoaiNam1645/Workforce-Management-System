import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateSalaryRateDto {
  @IsIn(['hourly', 'monthly'])
  payType!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseRate!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode = 'VND';

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}
