import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController, OrgController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OrgService } from './org.service';

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, OrgController],
  providers: [EmployeesService, OrgService],
})
export class EmployeesModule {}
