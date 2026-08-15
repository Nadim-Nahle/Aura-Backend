import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../auth-validation/authenticated-request.interface';
import { Roles } from '../auth-validation/roles.decorator';
import { AdminCreateUserDto } from './admin-create-user.dto';
import { AdminUpdateUserDto } from './admin-update-user.dto';
import { AuthService } from './auth.service';
import { CreateSelfProfileDto } from './create-self-profile.dto';
import { UpdateSelfProfileDto } from './update-self-profile.dto';
import { UserResponseDto } from './user-response.dto';
import { User } from './user.entity';
import { UploadBarcodeDto } from './upload-barcode.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('users/me')
  async createMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() profileDto: CreateSelfProfileDto,
  ) {
    const user = await this.authService.createSelfProfile(
      request.user!.uid,
      profileDto,
    );
    return {
      message: 'User profile created successfully',
      user: this.toResponse(user),
    };
  }

  @Get('users/me')
  async getMyProfile(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.toResponse(
      await this.authService.getUserById(request.user!.uid),
    );
  }

  @Put('users/me')
  async updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() updateDto: UpdateSelfProfileDto,
  ) {
    const user = await this.authService.updateSelfProfile(
      request.user!.uid,
      updateDto,
    );
    return {
      message: 'User profile updated successfully',
      user: this.toResponse(user),
    };
  }

  @Delete('users/me')
  @HttpCode(HttpStatus.OK)
  async deleteMyAccount(@Req() request: AuthenticatedRequest) {
    await this.authService.deleteUser(request.user!.uid);
    return { message: 'User account deleted successfully' };
  }

  @Get('admin/users')
  @Roles('admin')
  async getAllUsers(
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponseDto[]> {
    const users = await this.authService.getAllUsers();
    response.header('X-Total-Count', users.length.toString());
    return users.map((user) => this.toResponse(user));
  }

  @Post('admin/users')
  @Roles('admin')
  async createUserAsAdmin(@Body() createDto: AdminCreateUserDto) {
    const user = await this.authService.createUserAsAdmin(createDto);
    return {
      message: 'User created successfully',
      user: this.toResponse(user),
    };
  }

  @Get('admin/users/:id')
  @Roles('admin')
  async getUserAsAdmin(@Param('id') userId: string): Promise<UserResponseDto> {
    return this.toResponse(await this.authService.getUserById(userId));
  }

  @Put('admin/users/:id')
  @Roles('admin')
  async updateUserAsAdmin(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() updateDto: AdminUpdateUserDto,
  ) {
    if (request.user!.uid === userId && updateDto.role === 'user') {
      throw new BadRequestException(
        'You cannot remove your own administrator access',
      );
    }

    const user = await this.authService.updateUserAsAdmin(userId, updateDto);
    return {
      message: 'User updated successfully',
      user: this.toResponse(user),
    };
  }

  @Post('admin/users/:id/barcode')
  @Roles('admin')
  async uploadUserBarcode(
    @Param('id') userId: string,
    @Body() uploadDto: UploadBarcodeDto,
  ) {
    const user = await this.authService.replaceUserBarcode(userId, uploadDto);
    return {
      message: 'Barcode uploaded successfully',
      user: this.toResponse(user),
    };
  }

  @Delete('admin/users/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteUserAsAdmin(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
  ) {
    if (request.user!.uid === userId) {
      throw new BadRequestException(
        'You cannot delete your own administrator account',
      );
    }

    await this.authService.deleteUser(userId);
    return { message: 'User account deleted successfully' };
  }

  private toResponse(user: User): UserResponseDto {
    return {
      id: user.uid,
      email: user.email,
      displayName: user.name,
      role: user.role,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      barcode: user.barcode,
      privateSessions: user.privateSessions,
      membership: user.membership,
      startDate: user.startDate,
      endDate: user.endDate,
      ...(user.birthDate ? { birthDate: user.birthDate } : {}),
    };
  }
}
