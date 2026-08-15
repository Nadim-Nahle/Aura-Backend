import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PackagesModule } from './packages/packages.module';
import { FirebaseAuthGuard } from './auth-validation/firebase-auth.guard';
import { RolesGuard } from './auth-validation/roles.guard';
import { ClassesModule } from './classes/classes.module';
import { ExpensesModule } from './expenses/expenses.module';

@Module({
  imports: [PackagesModule, ClassesModule, ExpensesModule],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
