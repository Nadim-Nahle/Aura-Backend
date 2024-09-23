import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: any;

  @Column()
  uid: any;

  @Column()
  email: string;

  @Column()
  role: any;

  @Column()
  name: string;

  @Column()
  phoneNumber: string;

  @Column()
  profilePicture: string;

  // Add more user properties as needed
}
