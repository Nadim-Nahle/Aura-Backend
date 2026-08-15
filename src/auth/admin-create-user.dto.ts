import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Trim, TrimAndLowercase } from '../common/transforms/string.transforms';
import { IsBirthDate } from './is-birth-date.decorator';

export class AdminCreateUserDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @TrimAndLowercase()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @Trim()
  @IsPhoneNumber()
  phoneNumber: string;

  @IsOptional()
  @Trim()
  @IsIn(['user', 'admin'])
  role?: 'user' | 'admin';

  @IsOptional()
  @Trim()
  @IsString()
  privateSessions?: string;

  @IsOptional()
  @Trim()
  @IsString()
  membership?: string;

  @IsOptional()
  @Trim()
  @ValidateIf((_, value) => value !== 'none')
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @Trim()
  @ValidateIf((_, value) => value !== 'none')
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Trim()
  @IsBirthDate()
  birthDate?: string | null;
}
