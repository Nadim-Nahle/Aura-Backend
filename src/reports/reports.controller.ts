import { Controller, Get, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../auth-validation/authenticated-request.interface';
import { Roles } from '../auth-validation/roles.decorator';
import { AdminReportSummary, ReportsService } from './reports.service';

@Controller('admin/reports')
@Roles('admin')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  async getSummary(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminReportSummary> {
    const result = await this.reportsService.getSummary();
    Object.assign((request.serverTimings ??= {}), result.timings);
    response.header(
      'Server-Timing',
      Object.entries(request.serverTimings)
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(', '),
    );
    return result.summary;
  }
}
