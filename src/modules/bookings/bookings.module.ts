import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ServicesController } from './services.controller';

@Module({
  controllers: [BookingsController, ServicesController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
