import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.service.findMine(user.id, unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.id);
  }
}
