import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  /** UsersService exporté pour usage dans d'autres modules (ex. WorkOrdersModule). */
  exports: [UsersService],
})
export class UsersModule {}
