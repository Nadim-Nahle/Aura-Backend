import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getAuth, UpdateRequest, UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { AdminCreateUserDto } from './admin-create-user.dto';
import { AdminUpdateUserDto } from './admin-update-user.dto';
import { CreateSelfProfileDto } from './create-self-profile.dto';
import { UpdateSelfProfileDto } from './update-self-profile.dto';
import { UploadBarcodeDto } from './upload-barcode.dto';
import { User } from './user.entity';

@Injectable()
export class AuthService {
  async createUserAsAdmin(createDto: AdminCreateUserDto): Promise<User> {
    const role = createDto.role ?? 'user';
    const name = createDto.name.trim();
    const email = createDto.email.trim().toLowerCase();
    const phoneNumber = createDto.phoneNumber.trim();
    const auth = getAuth();
    const authUser = await auth.createUser({
      displayName: name,
      email,
      password: createDto.password,
      phoneNumber,
    });

    const profile: User = {
      id: authUser.uid,
      uid: authUser.uid,
      email,
      name,
      phoneNumber,
      profilePicture: '',
      role,
      barcode: 'none',
      privateSessions: createDto.privateSessions?.trim() ?? 'none',
      membership: createDto.membership?.trim() ?? 'none',
      startDate: createDto.startDate?.trim() ?? 'none',
      endDate: createDto.endDate?.trim() ?? 'none',
      ...(createDto.birthDate ? { birthDate: createDto.birthDate.trim() } : {}),
    };

    try {
      await auth.setCustomUserClaims(authUser.uid, { role });
      await getFirestore().collection('users').doc(authUser.uid).set(profile);
    } catch (error) {
      try {
        await auth.deleteUser(authUser.uid);
      } catch (rollbackError) {
        this.logCompensationFailure(
          'delete_partially_created_auth_user',
          rollbackError,
        );
      }
      throw error;
    }

    return profile;
  }

  async createSelfProfile(
    userId: string,
    profileDto: CreateSelfProfileDto,
  ): Promise<User> {
    const authUser = await getAuth().getUser(userId);
    const userRef = getFirestore().collection('users').doc(userId);
    const existingProfile = await userRef.get();

    if (existingProfile.exists) {
      throw new ConflictException('A profile already exists for this user');
    }

    const role = authUser.customClaims?.role === 'admin' ? 'admin' : 'user';
    const name = profileDto.name.trim();
    const phoneNumber = profileDto.phoneNumber.trim();
    let claimsUpdated = false;
    let authUserUpdated = false;

    const newUser: User = {
      id: userId,
      uid: userId,
      email: authUser.email ?? '',
      name,
      phoneNumber,
      profilePicture: profileDto.profilePicture?.trim() ?? '',
      role,
      barcode: 'none',
      privateSessions: 'none',
      membership: 'none',
      startDate: 'none',
      endDate: 'none',
      ...(profileDto.birthDate
        ? { birthDate: profileDto.birthDate.trim() }
        : {}),
    };

    try {
      await getAuth().setCustomUserClaims(userId, {
        ...(authUser.customClaims ?? {}),
        role,
      });
      claimsUpdated = true;

      await getAuth().updateUser(userId, {
        displayName: name,
        phoneNumber,
      });
      authUserUpdated = true;

      await userRef.set(newUser);
    } catch (error) {
      await this.rollbackAuthChanges(
        userId,
        authUser,
        { displayName: name, phoneNumber },
        authUserUpdated,
        claimsUpdated,
      );
      throw error;
    }

    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    const snapshot = await getFirestore().collection('users').get();
    return Promise.all(snapshot.docs.map((doc) => this.getUserById(doc.id)));
  }

  async getUserById(userId: string): Promise<User> {
    const [userDoc, authUser] = await Promise.all([
      getFirestore().collection('users').doc(userId).get(),
      getAuth().getUser(userId),
    ]);

    if (!userDoc.exists) {
      throw new NotFoundException('User profile not found');
    }

    const userData = userDoc.data();
    if (!userData) {
      throw new NotFoundException('User profile not found');
    }

    return {
      id: userId,
      uid: userId,
      email: authUser.email ?? userData.email ?? '',
      phoneNumber: userData.phoneNumber ?? authUser.phoneNumber ?? '',
      name: userData.name ?? authUser.displayName ?? '',
      role: authUser.customClaims?.role === 'admin' ? 'admin' : 'user',
      profilePicture: userData.profilePicture ?? '',
      barcode: userData.barcode ?? 'none',
      privateSessions: userData.privateSessions ?? 'none',
      membership: userData.membership ?? 'none',
      startDate: userData.startDate ?? 'none',
      endDate: userData.endDate ?? 'none',
      ...(userData.birthDate ? { birthDate: userData.birthDate } : {}),
    };
  }

  async updateSelfProfile(
    userId: string,
    updateDto: UpdateSelfProfileDto,
  ): Promise<User> {
    return this.updateUser(userId, updateDto);
  }

  async updateUserAsAdmin(
    userId: string,
    updateDto: AdminUpdateUserDto,
  ): Promise<User> {
    return this.updateUser(userId, updateDto, true);
  }

  async replaceUserBarcode(
    userId: string,
    uploadDto: UploadBarcodeDto,
  ): Promise<User> {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensions[uploadDto.contentType];
    if (!extension) {
      throw new BadRequestException(
        'Barcode must be a JPEG, PNG, or WebP image',
      );
    }
    if (!uploadDto.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(uploadDto.data)) {
      throw new BadRequestException('Barcode image data is invalid');
    }

    const image = Buffer.from(uploadDto.data, 'base64');
    if (image.length === 0 || image.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Barcode image must be 5 MB or smaller');
    }
    if (!this.hasImageSignature(image, uploadDto.contentType)) {
      throw new BadRequestException(
        'Barcode content does not match the selected image type',
      );
    }

    await this.getUserById(userId);

    const bucket = getStorage().bucket();
    const prefix = `barcodes/${userId}/`;
    const [previousFiles] = await bucket.getFiles({ prefix });
    const objectPath = `${prefix}${randomUUID()}.${extension}`;
    const downloadToken = randomUUID();
    const storageFile = bucket.file(objectPath);

    await storageFile.save(image, {
      resumable: false,
      metadata: {
        contentType: uploadDto.contentType,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const barcodeUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

    try {
      const user = await this.updateUserAsAdmin(userId, {
        barcode: barcodeUrl,
      });
      await Promise.allSettled(
        previousFiles
          .filter((previousFile) => previousFile.name !== objectPath)
          .map((previousFile) => previousFile.delete()),
      );
      return user;
    } catch (error) {
      await storageFile.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  }

  private hasImageSignature(image: Buffer, contentType: string): boolean {
    if (contentType === 'image/png') {
      return image
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (contentType === 'image/jpeg') {
      return image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
    }
    if (contentType === 'image/webp') {
      return (
        image.subarray(0, 4).toString('ascii') === 'RIFF' &&
        image.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private async updateUser(
    userId: string,
    updateDto: UpdateSelfProfileDto | AdminUpdateUserDto,
    isAdminUpdate = false,
  ): Promise<User> {
    const userRef = getFirestore().collection('users').doc(userId);
    const [existingProfile, originalAuthUser] = await Promise.all([
      userRef.get(),
      getAuth().getUser(userId),
    ]);
    if (!existingProfile.exists) {
      throw new NotFoundException('User profile not found');
    }

    const authFields: {
      displayName?: string;
      email?: string;
      phoneNumber?: string;
    } = {};
    const profileFields: Record<string, unknown> = {};

    if (updateDto.name !== undefined) {
      const name = updateDto.name.trim();
      authFields.displayName = name;
      profileFields.name = name;
    }
    if (updateDto.phoneNumber !== undefined) {
      const phoneNumber = updateDto.phoneNumber.trim();
      authFields.phoneNumber = phoneNumber;
      profileFields.phoneNumber = phoneNumber;
    }
    if (updateDto.profilePicture !== undefined) {
      profileFields.profilePicture = updateDto.profilePicture.trim();
    }
    if (updateDto.birthDate !== undefined) {
      profileFields.birthDate =
        updateDto.birthDate === null
          ? FieldValue.delete()
          : updateDto.birthDate.trim();
    }

    if (isAdminUpdate) {
      const adminDto = updateDto as AdminUpdateUserDto;

      if (adminDto.email !== undefined) {
        const email = adminDto.email.trim().toLowerCase();
        authFields.email = email;
        profileFields.email = email;
      }

      for (const field of [
        'barcode',
        'privateSessions',
        'membership',
        'startDate',
        'endDate',
      ] as const) {
        if (adminDto[field] !== undefined) {
          profileFields[field] = adminDto[field].trim();
        }
      }
    }

    const adminRole = isAdminUpdate
      ? (updateDto as AdminUpdateUserDto).role
      : undefined;
    if (adminRole !== undefined) {
      profileFields.role = adminRole;
    }

    let authUserUpdated = false;
    let claimsUpdated = false;
    try {
      if (Object.keys(authFields).length > 0) {
        await getAuth().updateUser(userId, authFields);
        authUserUpdated = true;
      }

      if (adminRole !== undefined) {
        await getAuth().setCustomUserClaims(userId, {
          ...(originalAuthUser.customClaims ?? {}),
          role: adminRole,
        });
        claimsUpdated = true;
      }

      if (Object.keys(profileFields).length > 0) {
        await userRef.update(profileFields);
      }
    } catch (error) {
      await this.rollbackAuthChanges(
        userId,
        originalAuthUser,
        authFields,
        authUserUpdated,
        claimsUpdated,
      );
      throw error;
    }

    return this.getUserById(userId);
  }

  async deleteUser(userId: string): Promise<void> {
    const userRef = getFirestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    const profileData = userDoc.data();

    if (userDoc.exists) {
      await userRef.delete();
    }

    try {
      await getAuth().deleteUser(userId);
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/user-not-found') {
        return;
      }

      if (profileData) {
        try {
          await userRef.set(profileData);
        } catch (rollbackError) {
          this.logCompensationFailure('restore_deleted_profile', rollbackError);
        }
      }
      throw error;
    }
  }

  private async rollbackAuthChanges(
    userId: string,
    originalUser: UserRecord,
    changedFields: UpdateRequest,
    restoreUserFields: boolean,
    restoreClaims: boolean,
  ): Promise<void> {
    const rollbackOperations: Promise<unknown>[] = [];

    if (restoreUserFields) {
      const originalFields: UpdateRequest = {};
      if (changedFields.displayName !== undefined) {
        originalFields.displayName = originalUser.displayName ?? null;
      }
      if (changedFields.phoneNumber !== undefined) {
        originalFields.phoneNumber = originalUser.phoneNumber ?? null;
      }
      if (changedFields.email !== undefined && originalUser.email) {
        originalFields.email = originalUser.email;
      }

      if (Object.keys(originalFields).length > 0) {
        rollbackOperations.push(getAuth().updateUser(userId, originalFields));
      }
    }

    if (restoreClaims) {
      rollbackOperations.push(
        getAuth().setCustomUserClaims(
          userId,
          originalUser.customClaims ?? null,
        ),
      );
    }

    const results = await Promise.allSettled(rollbackOperations);
    results
      .filter((result) => result.status === 'rejected')
      .forEach((result) =>
        this.logCompensationFailure('restore_auth_user', result.reason),
      );
  }

  private logCompensationFailure(action: string, error: unknown): void {
    console.error({
      event: 'profile_compensation_failed',
      action,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
