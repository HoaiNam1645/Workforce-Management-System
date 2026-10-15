import { Controller, Get } from '@nestjs/common';
import { AppService, HealthResponse, HelloResponse } from './app.service';
import { Public } from './modules/access-control/decorators/public.decorator';

@Controller()
@Public()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): HelloResponse {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
