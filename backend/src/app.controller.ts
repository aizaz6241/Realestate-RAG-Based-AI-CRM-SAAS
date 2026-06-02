import { Controller, Get, Param, Res, HttpException, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ai/reports/:filename')
  getReport(@Param('filename') filename: string, @Res() res) {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'reports', filename);
    if (!fs.existsSync(filePath)) {
      throw new HttpException('Report not found', HttpStatus.NOT_FOUND);
    }
    return res.sendFile(filePath);
  }
}
