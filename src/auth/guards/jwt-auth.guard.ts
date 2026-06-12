import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protects routes with a valid access token (Passport 'jwt' strategy).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
