import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessControlService } from '../access-control.service';
import { AuthUser } from '../auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục');

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      request.user = await this.accessControlService.getAuthUser(payload.sub);
      return true;
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }
  }

  private extractToken(request: { headers: { authorization?: string } }) {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
