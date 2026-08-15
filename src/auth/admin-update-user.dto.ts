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

export class AdminUpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @TrimAndLowercase()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Trim()
  @IsPhoneNumber()
  phoneNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  @Trim()
  @IsIn(['user', 'admin'])
  role?: 'user' | 'admin';

  @IsOptional()
  @Trim()
  @IsString()
  barcode?: string;

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
