import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsUUID,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class UpdateEmployeeAccessDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['invited', 'active', 'locked', 'disabled'])
  status?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Mật khẩu phải có chữ hoa, chữ thường và chữ số' })
  password?: string;
}
