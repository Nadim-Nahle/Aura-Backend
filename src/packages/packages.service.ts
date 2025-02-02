import { Injectable, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Package } from './package.entity';
import { CreatePackageDto } from './create-package.dto';

@Injectable()
export class PackagesService {
  async createPackage(createPackageDto: CreatePackageDto): Promise<Package> {
    const { name, description, price } = createPackageDto;
    const packagesRef = admin.firestore().collection('packages');

    try {
      // Add a new package to Firestore
      const newPackageRef = packagesRef.doc();
      const newPackage: Package = {
        id: newPackageRef.id,
        name,
        description,
        price,
      };

      await newPackageRef.set(newPackage);

      return newPackage;
    } catch (error) {
      throw new Error('Failed to create package: ' + error.message);
    }
  }

  // New method to retrieve all packages
  async getAllPackages(): Promise<Package[]> {
    const packagesRef = admin.firestore().collection('packages');

    try {
      const querySnapshot = await packagesRef.get();
      const packages: Package[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const packageItem: Package = {
          id: doc.id,
          name: data.name,
          description: data.description,
          price: data.price,
        };
        packages.push(packageItem);
      });

      return packages;
    } catch (error) {
      throw new Error('Failed to retrieve packages: ' + error.message);
    }
  }

  async deletePackage(id: string): Promise<void> {
    const packageRef = admin.firestore().collection('packages').doc(id);

    try {
      const packageDoc = await packageRef.get();

      if (!packageDoc.exists) {
        throw new NotFoundException(`Package with ID ${id} not found`);
      }

      await packageRef.delete();
    } catch (error) {
      throw new Error('Failed to delete package: ' + error.message);
    }
  }
}
