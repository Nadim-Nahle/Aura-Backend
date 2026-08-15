import { Injectable, NotFoundException } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { CreatePackageDto } from './create-package.dto';
import { Package } from './package.entity';

@Injectable()
export class PackagesService {
  async createPackage(createPackageDto: CreatePackageDto): Promise<Package> {
    const newPackageRef = getFirestore().collection('packages').doc();
    const newPackage: Package = {
      id: newPackageRef.id,
      ...createPackageDto,
    };

    await newPackageRef.set(newPackage);
    return newPackage;
  }

  async getAllPackages(): Promise<Package[]> {
    const querySnapshot = await getFirestore().collection('packages').get();
    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        description: data.description,
        price: data.price,
      };
    });
  }

  async deletePackage(id: string): Promise<void> {
    const packageRef = getFirestore().collection('packages').doc(id);
    const packageDoc = await packageRef.get();

    if (!packageDoc.exists) {
      throw new NotFoundException(`Package with ID ${id} not found`);
    }

    await packageRef.delete();
  }
}
