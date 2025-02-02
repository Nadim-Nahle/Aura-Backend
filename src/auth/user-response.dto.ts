// user-response.dto.ts
import { IsString, IsEmail } from 'class-validator';

export class UserResponseDto {
  @IsString()
  id: string;

  @IsEmail()
  email: string;

  @IsString()
  displayName: string;

  @IsString()
  role: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  profilePicture: string;

  @IsString()
  barcode: string;

  @IsString()
  privateSessions: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsString()
  membership: string;

  // Add other user properties you want to include in the response
}
