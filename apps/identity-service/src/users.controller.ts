import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { IdentityService, type ProfilePatch } from './identity.service';

@Controller('v1/users')
export class UsersController {
  constructor(private readonly identity: IdentityService) {}
  @Get('me') me(@Headers('authorization') authorization?: string) { return this.identity.me(authorization); }
  @Patch('me') update(@Headers('authorization') authorization: string | undefined, @Body() body: ProfilePatch) { return this.identity.updateProfile(authorization, body); }
  @Get(':id') user(@Param('id') id: string) { return this.identity.getUser(id); }
}
