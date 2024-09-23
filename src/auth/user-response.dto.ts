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

  // Add other user properties you want to include in the response
}
