import { Injectable } from '@nestjs/common';

export interface HelloResponse {
  message: string;
  service: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

@Injectable()
export class AppService {
  getHello(): HelloResponse {
    return {
      message: 'Hello World!',
      service: 'Workforce Management API',
    };
  }

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
