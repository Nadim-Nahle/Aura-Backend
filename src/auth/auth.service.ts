import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { SignupDto } from './signup.dto';
import * as admin from 'firebase-admin';
import { User } from './user.entity';
import { UpdateUserDto } from './updateUser.dto';

@Injectable()
export class AuthService {
  async createUser(
    signupDto: SignupDto,
    role: string,
    barcode: string,
    privateSessions: string,
    membership: string,
    startDate: string,
    endDate: string,
  ): Promise<User> {
    const { email, password, name, phoneNumber } = signupDto;

    try {
      // Create the user in Firebase Authentication
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        phoneNumber,
      });

      // Set custom claim for user role
      await admin.auth().setCustomUserClaims(userRecord.uid, { role });

      // Create a new user object
      const newUser = {
        id: userRecord.uid,
        email: userRecord.email || '',
        phoneNumber: userRecord.phoneNumber || '',
        profilePicture: userRecord.phoneNumber || '',
        name: userRecord.displayName || '',
        role: role || 'user',
        uid: userRecord.uid,
        barcode: barcode || 'none',
        privateSessions: privateSessions || 'none',
        membership: membership || 'none',
        startDate: startDate || 'none',
        endDate: endDate || 'none',
      };

      // Save the user in Firestore
      await admin
        .firestore()
        .collection('users')
        .doc(userRecord.uid)
        .set(newUser);

      return newUser;
    } catch (error) {
      // Check if the error is related to the phone number already existing
      if (error.code === 'auth/phone-number-already-exists') {
        throw new HttpException(
          'Phone number already exists',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Handle other Firebase auth errors or rethrow them
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAllUsers() {
    try {
      const userList = await admin.auth().listUsers();
      const usersWithRoles = await Promise.all(
        userList.users.map(async (user) => {
          const customClaims = (await admin.auth().getUser(user.uid))
            .customClaims;
          const role =
            customClaims && customClaims.role ? customClaims.role : 'user';

          return {
            id: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: role, // Include the user's role
            // Add other user properties you need
          };
        }),
      );

      return usersWithRoles;
    } catch (error) {
      throw new Error(`Error fetching users: ${error.message}`);
    }
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    const {
      name,
      email,
      phoneNumber,
      role,
      profilePicture,
      barcode,
      privateSessions,
      membership,
      startDate,
      endDate,
    } = updateUserDto;

    try {
      // Prepare the update object by filtering out undefined values
      const updateFields: any = {};

      if (name) updateFields.name = name;
      if (email) updateFields.email = email;
      if (phoneNumber) updateFields.phoneNumber = phoneNumber;
      if (role) updateFields.role = role;
      if (profilePicture) updateFields.profilePicture = profilePicture;
      if (barcode) updateFields.barcode = barcode;
      if (privateSessions) updateFields.privateSessions = privateSessions;
      if (membership) updateFields.membership = membership;
      if (startDate) updateFields.startDate = startDate;
      if (endDate) updateFields.endDate = endDate;

      // Update Firebase Authentication only with the provided fields
      await admin.auth().updateUser(userId, {
        email,
        displayName: name,
        phoneNumber,
      });

      // Update Firestore only with the provided fields
      const userRef = admin.firestore().collection('users').doc(userId);
      await userRef.update(updateFields);

      // Retrieve and return the updated user
      const updatedUser = await this.getUserById(userId); // Adjust if necessary to get updated data
      return updatedUser;
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  async getUserById(userId: string): Promise<User> {
    try {
      // Fetch user document from Firestore
      const userDoc = await admin
        .firestore()
        .collection('users')
        .doc(userId)
        .get();

      // Check if the document exists
      if (!userDoc.exists) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Retrieve user data from the document
      const userData = userDoc.data();

      // Ensure userData is not null and cast it to the User type
      if (!userData) {
        throw new HttpException(
          'User data is empty',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Construct and return the User object
      const user: User = {
        id: userData.id,
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        name: userData.name,
        role: userData.role,
        uid: userData.id,
        profilePicture: userData.profilePicture,
        barcode: userData.barcode,
        privateSessions: userData.privateSessions,
        membership: userData.membership,
        startDate: userData.startDate,
        endDate: userData.endDate,
      };

      return user;
    } catch (error) {
      // Handle errors related to Firestore operations
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteClass(id: string): Promise<void> {
    const classRef = admin.firestore().collection('classes').doc(id);

    try {
      const classDoc = await classRef.get();

      if (!classDoc.exists) {
        throw new NotFoundException(`class with ID ${id} not found`);
      }

      await classRef.delete();
    } catch (error) {
      throw new Error('Failed to delete class: ' + error.message);
    }
  }
}
