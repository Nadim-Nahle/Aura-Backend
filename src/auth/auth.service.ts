import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getAuth, UpdateRequest, UserRecord } from 'firebase-admin/auth';
import {
  DocumentData,
  FieldPath,
  FieldValue,
  getFirestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { AdminCreateUserDto } from './admin-create-user.dto';
import { AdminUpdateUserDto } from './admin-update-user.dto';
import { CreateSelfProfileDto } from './create-self-profile.dto';
import {
  UserDirectoryDateField,
  UserDirectoryMembership,
  UserDirectorySort,
  UserDirectoryStatus,
} from './list-users-query.dto';
import { UpdateSelfProfileDto } from './update-self-profile.dto';
import { UploadBarcodeDto } from './upload-barcode.dto';
import { User } from './user.entity';

export interface UserDirectoryPage {
  users: User[];
  total: number;
  nextPageToken?: string;
  timings: Record<string, number>;
}

const USER_DIRECTORY_CACHE_TTL_MS = 15_000;
const USER_DIRECTORY_FIELDS = [
  'email',
  'phoneNumber',
  'name',
  'role',
  'profilePicture',
  'barcode',
  'privateSessions',
  'membership',
  'startDate',
  'endDate',
  'birthDate',
] as const;

interface UserDirectoryRecord {
  id: string;
  data: DocumentData;
}

export interface UserDirectoryOptions {
  search?: string;
  sort?: UserDirectorySort;
  membership?: UserDirectoryMembership;
  status?: UserDirectoryStatus;
  dateField?: UserDirectoryDateField;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AuthService {
  private readonly userDirectoryCache = new Map<
    string,
    { expiresAt: number; page: Omit<UserDirectoryPage, 'timings'> }
  >();
  private searchableDirectoryCache?: {
    expiresAt: number;
    records: UserDirectoryRecord[];
  };

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
      this.invalidateUserDirectoryCache();
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
      this.invalidateUserDirectoryCache();
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

  async getUsersPage(
    limit = 50,
    pageToken?: string,
    options: UserDirectoryOptions = {},
  ): Promise<UserDirectoryPage> {
    const cacheStartedAt = performance.now();
    const normalizedOptions = this.normalizeDirectoryOptions(options);
    const cacheKey = JSON.stringify({
      limit,
      pageToken: pageToken ?? '',
      ...normalizedOptions,
    });
    const cached = this.userDirectoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.page,
        timings: {
          directory_cache: performance.now() - cacheStartedAt,
        },
      };
    }
    if (cached) {
      this.userDirectoryCache.delete(cacheKey);
    }

    const cursorId = pageToken ? this.decodePageToken(pageToken) : undefined;
    const usersRef = getFirestore().collection('users');
    let pageRecords: UserDirectoryRecord[];
    let total: number;
    let firestorePageDurationMs: number;
    let firestoreCountDurationMs = 0;

    const requiresDirectoryScan = Object.values(normalizedOptions).some(
      (value) => Boolean(value),
    );
    if (requiresDirectoryScan) {
      const searchStartedAt = performance.now();
      const directory = await this.getSearchableDirectory();
      const matchingRecords = this.sortDirectoryRecords(
        directory.filter((record) =>
          this.matchesDirectoryFilters(record, normalizedOptions),
        ),
        normalizedOptions.sort,
      );
      const startIndex = cursorId
        ? this.findCursorStartIndex(matchingRecords, cursorId)
        : 0;
      pageRecords = matchingRecords.slice(startIndex, startIndex + limit + 1);
      total = matchingRecords.length;
      firestorePageDurationMs = performance.now() - searchStartedAt;
    } else {
      let usersQuery = usersRef
        .orderBy(FieldPath.documentId())
        .select(...USER_DIRECTORY_FIELDS);
      if (cursorId) {
        usersQuery = usersQuery.startAfter(cursorId);
      }

      const pageStartedAt = performance.now();
      const pagePromise = usersQuery
        .limit(limit + 1)
        .get()
        .then((snapshot) => ({
          records: snapshot.docs.map((doc) => ({
            id: doc.id,
            data: doc.data(),
          })),
          durationMs: performance.now() - pageStartedAt,
        }));
      const countStartedAt = performance.now();
      const countPromise = usersRef
        .count()
        .get()
        .then((snapshot) => ({
          total: snapshot.data().count,
          durationMs: performance.now() - countStartedAt,
        }));
      const [pageResult, countResult] = await Promise.all([
        pagePromise,
        countPromise,
      ]);
      pageRecords = pageResult.records;
      total = countResult.total;
      firestorePageDurationMs = pageResult.durationMs;
      firestoreCountDurationMs = countResult.durationMs;
    }

    const hasMore = pageRecords.length > limit;
    const selectedRecords = pageRecords.slice(0, limit);
    const authStartedAt = performance.now();
    const authResult = selectedRecords.length
      ? await getAuth().getUsers(
          selectedRecords.map((record) => ({ uid: record.id })),
        )
      : { users: [] };
    const authUsers = new Map(
      authResult.users.map((user) => [user.uid, user] as const),
    );
    const authDurationMs = performance.now() - authStartedAt;
    const mappingStartedAt = performance.now();
    const users: User[] = selectedRecords.map((record) => {
      const userData = record.data;
      const authUser = authUsers.get(record.id);

      return {
        id: record.id,
        uid: record.id,
        email: authUser?.email ?? userData.email ?? '',
        phoneNumber: userData.phoneNumber ?? authUser?.phoneNumber ?? '',
        name: userData.name ?? authUser?.displayName ?? '',
        role: authUser?.customClaims?.role === 'admin' ? 'admin' : 'user',
        profilePicture: userData.profilePicture ?? '',
        barcode: userData.barcode ?? 'none',
        privateSessions: userData.privateSessions ?? 'none',
        membership: userData.membership ?? 'none',
        startDate: userData.startDate ?? 'none',
        endDate: userData.endDate ?? 'none',
        ...(userData.birthDate ? { birthDate: userData.birthDate } : {}),
      };
    });
    const mappingDurationMs = performance.now() - mappingStartedAt;
    const lastUserId = selectedRecords[selectedRecords.length - 1]?.id;

    const page: Omit<UserDirectoryPage, 'timings'> = {
      users,
      total,
      ...(hasMore && lastUserId
        ? { nextPageToken: this.encodePageToken(lastUserId) }
        : {}),
    };
    this.userDirectoryCache.set(cacheKey, {
      expiresAt: Date.now() + USER_DIRECTORY_CACHE_TTL_MS,
      page,
    });

    return {
      ...page,
      timings: {
        firestore_page: firestorePageDurationMs,
        firestore_count: firestoreCountDurationMs,
        directory_auth: authDurationMs,
        profile_mapping: mappingDurationMs,
      },
    };
  }

  private normalizeDirectoryOptions(
    options: UserDirectoryOptions,
  ): UserDirectoryOptions {
    const search = options.search?.trim().toLowerCase() || undefined;
    const hasDateRange = Boolean(options.dateFrom || options.dateTo);
    const normalized: UserDirectoryOptions = {
      ...(search ? { search } : {}),
      ...(options.sort ? { sort: options.sort } : {}),
      ...(options.membership ? { membership: options.membership } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(hasDateRange
        ? {
            dateField: options.dateField ?? 'endDate',
            ...(options.dateFrom ? { dateFrom: options.dateFrom } : {}),
            ...(options.dateTo ? { dateTo: options.dateTo } : {}),
          }
        : {}),
    };

    if (
      normalized.dateFrom &&
      normalized.dateTo &&
      this.getDateBoundary(normalized.dateFrom, false) >
        this.getDateBoundary(normalized.dateTo, true)
    ) {
      throw new BadRequestException(
        'The start of the date range must be before the end',
      );
    }

    return normalized;
  }

  private matchesDirectoryFilters(
    record: UserDirectoryRecord,
    options: UserDirectoryOptions,
  ): boolean {
    const { data } = record;
    if (
      options.search &&
      ![data.name, data.email, data.phoneNumber, data.membership]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(options.search!))
    ) {
      return false;
    }

    const membership =
      typeof data.membership === 'string' ? data.membership : 'none';
    if (options.membership && membership !== options.membership) {
      return false;
    }

    if (options.status) {
      const endDate = this.getRecordDate(data.endDate);
      const isMembershipSelected = membership !== 'none';
      const matchesStatus =
        options.status === 'no-membership'
          ? !isMembershipSelected
          : options.status === 'active'
            ? isMembershipSelected && endDate !== null && endDate >= Date.now()
            : isMembershipSelected && endDate !== null && endDate < Date.now();
      if (!matchesStatus) {
        return false;
      }
    }

    if (options.dateFrom || options.dateTo) {
      const date = this.getRecordDate(data[options.dateField ?? 'endDate']);
      if (date === null) {
        return false;
      }
      if (
        options.dateFrom &&
        date < this.getDateBoundary(options.dateFrom, false)
      ) {
        return false;
      }
      if (options.dateTo && date > this.getDateBoundary(options.dateTo, true)) {
        return false;
      }
    }

    return true;
  }

  private sortDirectoryRecords(
    records: UserDirectoryRecord[],
    sort?: UserDirectorySort,
  ): UserDirectoryRecord[] {
    if (!sort) {
      return records;
    }

    return [...records].sort((left, right) => {
      let comparison = 0;
      if (sort === 'name-asc' || sort === 'name-desc') {
        comparison = String(left.data.name ?? '').localeCompare(
          String(right.data.name ?? ''),
          undefined,
          { sensitivity: 'base' },
        );
        if (sort === 'name-desc') comparison *= -1;
      } else {
        const field = sort.startsWith('start-') ? 'startDate' : 'endDate';
        const leftDate = this.getRecordDate(left.data[field]);
        const rightDate = this.getRecordDate(right.data[field]);
        if (leftDate === null && rightDate !== null) return 1;
        if (leftDate !== null && rightDate === null) return -1;
        if (leftDate !== null && rightDate !== null) {
          comparison = leftDate - rightDate;
          if (sort.endsWith('-newest')) comparison *= -1;
        }
      }

      return comparison || left.id.localeCompare(right.id);
    });
  }

  private getRecordDate(value: unknown): number | null {
    if (typeof value !== 'string' || !value || value === 'none') return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private getDateBoundary(value: string, endOfDay: boolean): number {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : value;
    const timestamp = Date.parse(normalized);
    if (Number.isNaN(timestamp)) {
      throw new BadRequestException('The date filter is invalid');
    }
    return timestamp;
  }

  private async getSearchableDirectory(): Promise<UserDirectoryRecord[]> {
    if (
      this.searchableDirectoryCache &&
      this.searchableDirectoryCache.expiresAt > Date.now()
    ) {
      return this.searchableDirectoryCache.records;
    }

    const snapshot = await getFirestore()
      .collection('users')
      .orderBy(FieldPath.documentId())
      .select(...USER_DIRECTORY_FIELDS)
      .get();
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
    this.searchableDirectoryCache = {
      expiresAt: Date.now() + USER_DIRECTORY_CACHE_TTL_MS,
      records,
    };
    return records;
  }

  private findCursorStartIndex(
    records: UserDirectoryRecord[],
    cursorId: string,
  ): number {
    const cursorIndex = records.findIndex((record) => record.id === cursorId);
    if (cursorIndex >= 0) return cursorIndex + 1;
    const insertionIndex = records.findIndex((record) => record.id > cursorId);
    return insertionIndex >= 0 ? insertionIndex : records.length;
  }

  private encodePageToken(userId: string): string {
    return Buffer.from(JSON.stringify({ version: 1, userId }), 'utf8').toString(
      'base64url',
    );
  }

  private decodePageToken(pageToken: string): string {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(pageToken)) {
        throw new Error('Invalid base64url token');
      }
      const decoded = JSON.parse(
        Buffer.from(pageToken, 'base64url').toString('utf8'),
      ) as { version?: unknown; userId?: unknown };
      if (
        decoded.version !== 1 ||
        typeof decoded.userId !== 'string' ||
        !decoded.userId ||
        decoded.userId.length > 128
      ) {
        throw new Error('Invalid token payload');
      }
      return decoded.userId;
    } catch {
      throw new BadRequestException('The page token is invalid');
    }
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
        this.invalidateUserDirectoryCache();
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
      this.invalidateUserDirectoryCache();
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

  private invalidateUserDirectoryCache(): void {
    this.userDirectoryCache.clear();
    this.searchableDirectoryCache = undefined;
  }
}
