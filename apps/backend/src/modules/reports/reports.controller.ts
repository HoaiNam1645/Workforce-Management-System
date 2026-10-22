import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { AuthUser } from '../access-control/auth-user.type';
import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @RequirePermissions('reports.view')
  overview(@Query() query: ReportQueryDto, @CurrentUser() actor: AuthUser) {
    return this.reportsService.overview(query, actor);
  }

  @Get('export')
  @RequirePermissions('reports.export')
  async export(@Query() query: ReportExportQueryDto, @CurrentUser() actor: AuthUser, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    const result = await this.reportsService.export(query, actor);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return new StreamableFile(result.buffer);
  }
}
