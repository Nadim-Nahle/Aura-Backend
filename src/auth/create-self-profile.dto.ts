import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../common/transforms/string.transforms';
import { IsBirthDate } from './is-birth-date.decorator';

export class CreateSelfProfileDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Trim()
  @IsPhoneNumber()
  phoneNumber: string;

  @IsOptional()
  @Trim()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  @Trim()
  @IsBirthDate()
  birthDate?: string | null;
}
