import { Injectable, NotFoundException } from '@nestjs/common';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { CreateExpenseDto } from './create-expense.dto';

export interface Expense {
  id: string;
  name: string;
  price: number;
  createdAt: string;
}

@Injectable()
export class ExpensesService {
  private readonly collectionName = 'expenses';

  async create(createDto: CreateExpenseDto): Promise<Expense> {
    const document = {
      name: createDto.name.trim(),
      price: createDto.price,
      createdAt: Timestamp.now(),
    };
    const reference = await getFirestore()
      .collection(this.collectionName)
      .add(document);

    return this.toExpense(reference.id, document);
  }

  async findAll(): Promise<Expense[]> {
    const snapshot = await getFirestore()
      .collection(this.collectionName)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((document) =>
      this.toExpense(document.id, document.data()),
    );
  }

  async delete(id: string): Promise<void> {
    const reference = getFirestore().collection(this.collectionName).doc(id);
    const document = await reference.get();
    if (!document.exists) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }
    await reference.delete();
  }

  private toExpense(id: string, data: Record<string, any>): Expense {
    const createdAt = data.createdAt;
    return {
      id,
      name: data.name,
      price: data.price,
      createdAt:
        createdAt instanceof Timestamp
          ? createdAt.toDate().toISOString()
          : new Date(createdAt ?? 0).toISOString(),
    };
  }
}
