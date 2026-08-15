import { Injectable, NotFoundException } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { CreateClassDto } from './create-class.dto';

@Injectable()
export class ClassesService {
  async create(createClassDto: CreateClassDto) {
    const newClass = {
      ...createClassDto,
      createdAt: new Date(),
    };
    const docRef = await getFirestore().collection('classes').add(newClass);

    return { id: docRef.id, ...newClass };
  }

  async findAll() {
    const snapshot = await getFirestore().collection('classes').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async delete(id: string): Promise<void> {
    const classRef = getFirestore().collection('classes').doc(id);
    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      throw new NotFoundException(`Class with ID ${id} not found`);
    }

    await classRef.delete();
  }
}
