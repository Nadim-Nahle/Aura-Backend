import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  Get,
  Response,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './signup.dto';
import { UpdateUserDto } from './updateUser.dto';
import { UserResponseDto } from './user-response.dto';
import * as admin from 'firebase-admin';

@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('users')
  @UsePipes(new ValidationPipe())
  async signup(@Body() signupDto: SignupDto) {
    const { role, ...userData } = signupDto; // Extract the role from the DTO

    const user = await this.authService.createUser(userData, role);

    // Return a success response or JWT token, if needed
    return { message: 'User registered successfully', user };
  }

  @Get('users')
  async getAllUsers(@Response() response: any) {
    const users = await this.authService.getAllUsers();
    const totalCount = users.length; // You can modify this to get the actual count
    response.header('X-Total-Count', totalCount.toString()); // Set the X-Total-Count header
    return response.json(users);
  }

  @Put('users/:id')
  async updateRole(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const updatedUser = await this.authService.updateUser(
      userId,
      updateUserDto,
    );

    // Map the updated user record to the response DTO
    const userResponse = {
      id: updatedUser.uid,
      email: updatedUser.email,
      displayName: updatedUser.name,
      phoneNumber: updatedUser.phoneNumber,
      profilePicture: updatedUser.profilePicture,
      // Add other fields if needed
    };

    return {
      message: 'User updated successfully',
      user: userResponse,
    };
  }

  @Get('users/:id')
  async getUserById(@Param('id') userId: string): Promise<UserResponseDto> {
    const user = await this.authService.getUserById(userId);

    const customClaims = (await admin.auth().getUser(userId)).customClaims;
    const role = customClaims && customClaims.role ? customClaims.role : 'user';
    // Map the user data to the UserResponseDto
    const userResponse: UserResponseDto = {
      id: user.uid,
      email: user.email,
      displayName: user.name,
      role: role,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      // Map other user properties as needed
    };

    return userResponse;
  }

  @Delete('users/:id')
  async deleteUserById(@Param('id') userId: string): Promise<string> {
    try {
      // Delete the user from Firebase Authentication
      await admin.auth().deleteUser(userId);

      // You can also perform additional cleanup or actions if needed

      return `User with ID ${userId} has been deleted.`;
    } catch (error) {
      // Handle any errors, such as user not found, access denied, etc.
      // You can return an error response or throw an exception as needed
      return `Failed to delete user: ${error.message}`;
    }
  }
}
