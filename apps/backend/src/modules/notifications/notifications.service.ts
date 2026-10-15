import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(@InjectRepository(Notification) private readonly repository: Repository<Notification>) {}

  async findMine(userId: string, unreadOnly: boolean) {
    const notifications = await this.repository.find({ where: unreadOnly ? { userId, readAt: IsNull() } : { userId }, order: { createdAt: 'DESC' }, take: 50 });
    return { items: notifications, unread: await this.repository.count({ where: { userId, readAt: IsNull() } }) };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.repository.findOneBy({ id, userId });
    if (!notification) throw new NotFoundException('Không tìm thấy thông báo');
    notification.readAt = notification.readAt ?? new Date();
    return this.repository.save(notification);
  }
}
