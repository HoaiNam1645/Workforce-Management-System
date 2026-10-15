import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const entities = [
  NotificationPreference,
  Notification,
  NotificationDelivery,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}
