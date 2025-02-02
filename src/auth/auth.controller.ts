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
    const {
      startDate,
      endDate,
      membership,
      barcode,
      privateSessions,
      role,
      ...userData
    } = signupDto; // Extract the role from the DTO

    const user = await this.authService.createUser(
      userData,
      role,
      barcode,
      privateSessions,
      membership,
      startDate,
      endDate,
    );

    // Return a success response or JWT token, if needed
    return { message: 'User registered successfully', user };
  }

  @Get('users/admin/topSecret')
  async getAllUsers(@Response() response: any) {
    try {
      const firestore = admin.firestore();
      const usersCollection = firestore.collection('users'); // Replace 'users' with your Firestore collection name
      const snapshot = await usersCollection.get();

      if (snapshot.empty) {
        response.header('X-Total-Count', '0');
        return response.json([]);
      }

      const users = snapshot.docs.map((doc) => ({
        id: doc.id, // Document ID
        ...doc.data(), // Document fields
      }));

      const totalCount = users.length;
      response.header('X-Total-Count', totalCount.toString());
      return response.json(users);
    } catch (error) {
      return response.status(500).json({
        message: 'Failed to fetch users from Firestore',
        error: error.message,
      });
    }
  }

  @Put('users/:id')
  async updateUser(
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
      role: updatedUser.role,
      profilePicture: updatedUser.profilePicture,
      barcode: updatedUser.barcode,
      privateSessions: updatedUser.privateSessions,
      membership: updatedUser.membership,
      startDate: updatedUser.startDate,
      endDate: updatedUser.endDate,
      // Add other fields if needed
    };

    return {
      message: 'User updated successfully',
      user: userResponse,
    };
  }

  @Get('users/:id')
  async getUserById(@Param('id') userId: string): Promise<UserResponseDto> {
    try {
      // Fetch the user document from Firestore
      const userDoc = await admin
        .firestore()
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();

      // Fetch custom claims from Firebase Auth
      const customClaims = (await admin.auth().getUser(userId)).customClaims;
      const role =
        customClaims && customClaims.role ? customClaims.role : 'user';

      // Map the Firestore data and custom claims to the UserResponseDto
      const userResponse: UserResponseDto = {
        id: userId,
        email: userData?.email || '',
        displayName: userData?.name || '',
        role: role,
        phoneNumber: userData?.phoneNumber || '',
        profilePicture: userData?.profilePicture || '',
        barcode: userData?.barcode,
        privateSessions: userData?.privateSessions,
        membership: userData?.membership,
        startDate: userData?.startDate,
        endDate: userData?.endDate,
        // Map other Firestore properties as needed
      };

      return userResponse;
    } catch (error) {
      throw new Error(`Error fetching user: ${error.message}`);
    }
  }

  @Delete('users/:id')
  async deleteUserById(@Param('id') userId: string): Promise<string> {
    try {
      // Delete the user from Firebase Authentication
      await admin.auth().deleteUser(userId);

      // Delete the user from Firestore
      const firestore = admin.firestore();
      const userDocRef = firestore.collection('users').doc(userId); // Assuming users are stored in 'users' collection
      const userDoc = await userDocRef.get();

      if (userDoc.exists) {
        await userDocRef.delete();
      } else {
        return `User with ID ${userId} was deleted from Authentication, but no Firestore document was found.`;
      }

      return `User with ID ${userId} has been deleted from Authentication and Firestore.`;
    } catch (error) {
      // Handle errors
      return `Failed to delete user: ${error.message}`;
    }
  }

  @Post('update-expired-memberships')
  async updateExpiredMemberships(@Response() response: any) {
    try {
      console.log('Running manual task to update expired memberships');

      const firestore = admin.firestore();
      const usersRef = firestore.collection('users');
      const snapshot = await usersRef.get();
      const currentDate = new Date();

      const usersToUpdate: any[] = [];

      snapshot.forEach((doc) => {
        const user = doc.data();
        const endDate = user.endDate;

        // Skip users with 'none' as the endDate
        if (endDate === 'none') {
          return;
        }

        // Convert the endDate string to a Date object
        const endDateObj = new Date(endDate);

        // If the end date has passed and membership is not already 'none', update the membership type
        if (endDateObj < currentDate) {
          usersToUpdate.push(doc.id);
        }
      });

      const updatePromises = usersToUpdate.map((userId) => {
        return Promise.all([
          usersRef.doc(userId).update({ membership: 'none' }),
          usersRef.doc(userId).update({ privateSessions: '0' }),
        ]);
      });

      await Promise.all(updatePromises);

      console.log(`Updated ${usersToUpdate.length} users`);

      return response.json({
        message: `Updated ${usersToUpdate.length} users`,
      });
    } catch (error) {
      console.error('Error updating expired memberships:', error);
      return response.status(500).json({
        message: 'Failed to update expired memberships',
        error: error.message,
      });
    }
  }

  @Post('classes')
  async addClass(
    @Body() body: { name: string; price: string },
    @Response() response: any,
  ) {
    try {
      console.log('Adding a new class');

      // Initialize Firestore
      const firestore = admin.firestore();
      const classesRef = firestore.collection('classes');

      const { name, price } = body;

      // Validate the input fields
      if (!name || !price) {
        return response.status(400).json({
          message: 'Invalid input. Both name and price are required.',
        });
      }

      // Create a new class object
      const newClass = {
        name,
        price,
        createdAt: new Date(),
      };

      // Add the class to Firestore
      const docRef = await classesRef.add(newClass);

      console.log(`class added with ID: ${docRef.id}`);

      // Return a success message
      return response.status(201).json({
        message: 'class added successfully',
        id: docRef.id,
        name: newClass.name,
        price: newClass.price,
      });
    } catch (error) {
      console.error('Error adding class:', error);
      return response.status(500).json({
        message: 'Failed to add class',
        error: error.message,
      });
    }
  }

  @Get('classes')
  async getClasses(@Response() response: any) {
    try {
      console.log('Fetching all classes');

      const firestore = admin.firestore();
      const classesRef = firestore.collection('classes');
      const snapshot = await classesRef.get();

      const classes: any[] = [];
      snapshot.forEach((doc) => {
        classes.push({ id: doc.id, ...doc.data() });
      });

      return response.json(classes);
    } catch (error) {
      console.error('Error fetching classes:', error);
      return response.status(500).json({
        message: 'Failed to fetch classes',
        error: error.message,
      });
    }
  }

  @Delete('classes/:id')
  async deleteClass(@Param('id') id: string): Promise<{ message: string }> {
    await this.authService.deleteClass(id);
    return { message: `Class with ID ${id} has been deleted.` };
  }
}
