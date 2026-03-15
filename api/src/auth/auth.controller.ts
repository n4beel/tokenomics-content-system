import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard)
  createUser(@Body() body: { email: string; password: string }) {
    return this.auth.createUser(body.email, body.password);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  listUsers() {
    return this.auth.listUsers();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: any) {
    return this.auth.getMe(req.user.sub);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Request() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }
}
