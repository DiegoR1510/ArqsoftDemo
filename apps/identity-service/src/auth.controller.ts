import { Body, Controller, Post } from '@nestjs/common';
import { IdentityService, type RegisterBody, type TokenBody } from './identity.service';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly identity: IdentityService) {}
  @Post('register') register(@Body() body: RegisterBody) { return this.identity.register(body); }
  @Post('token') token(@Body() body: TokenBody) { return this.identity.token(body); }
  @Post('introspect') introspect(@Body() body: { access_token?: string; token?: string }) { return this.identity.introspect(body.access_token ?? body.token); }
}
