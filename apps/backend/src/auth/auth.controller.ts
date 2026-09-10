import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequestMeta } from '../common/decorators/request-metadata.decorator';
import type { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
/**
 * Every route here is unauthenticated by design, so the per-IP throttle is the
 * only thing standing between an attacker and unlimited attempts. Applied at
 * the controller so a route added later inherits it instead of being forgotten.
 */
@UseGuards(AuthThrottlerGuard)
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Tighter than the other auth routes, because this one is an email oracle
   * and cannot stop being one.
   *
   * A 409 tells the caller the address is taken. Hiding that would mean
   * returning the same response for a new and an existing address — but
   * register signs the caller in and returns an access token, so a uniform
   * response is impossible unless nobody gets a token, which means every
   * signup has to go through email verification. There is no email transport
   * in this codebase, so that is a real feature, not a patch. Faking success
   * without it would tell a genuine user their account exists when it does
   * not, and they would then be unable to sign in.
   *
   * So the oracle stays and is made expensive instead: 10 per hour per IP
   * rather than 10 per minute, a 60x cut in enumeration throughput that a
   * person registering an account will never notice. Attempts against an
   * address that already exists are audited (see AuthService.register), so the
   * probing is visible rather than silent.
   *
   * The real fix is email verification. Until then, do not "close" this by
   * returning a fake 201.
   */
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 3_600_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  register(@Body() dto: RegisterDto, @RequestMeta() request: RequestMetadata) {
    return this.authService.register(dto, request);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login and receive a JWT access token' })
  login(@Body() dto: LoginDto, @RequestMeta() request: RequestMetadata) {
    return this.authService.login(dto, request);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Request a password reset code. The code is never returned — it is stored in Redis only.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using the code from forgot-password' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
