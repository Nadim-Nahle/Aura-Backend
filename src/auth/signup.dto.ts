import {
  IsString,
  IsEmail,
  MinLength,
  IsOptional,
  IsPhoneNumber,
} from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  role?: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  barcode?: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  privateSessions?: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  startDate?: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  endDate?: string;

  @IsString()
  @IsOptional() // Make the 'role' field optional
  membership?: string;

  @IsPhoneNumber()
  phoneNumber: string;
}
