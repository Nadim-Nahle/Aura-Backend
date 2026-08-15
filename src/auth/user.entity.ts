export interface User {
  id: string;
  uid: string;
  email: string;
  role: 'user' | 'admin';
  barcode: string;
  privateSessions: string;
  startDate: string;
  endDate: string;
  membership: string;
  name: string;
  phoneNumber: string;
  profilePicture: string;
  birthDate?: string;
}
