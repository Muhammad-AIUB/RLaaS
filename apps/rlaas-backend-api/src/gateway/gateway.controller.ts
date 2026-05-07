import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { GatewayCheckDto } from './dto/gateway-check.dto';

@ApiTags('gateway')
@Controller('gateway')
export class GatewayController {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  @Post('check')
  @ApiOperation({ summary: 'Check whether a request should be allowed' })
  check(@Body() dto: GatewayCheckDto) {
    return this.rateLimiterService.checkRequest(dto);
  }
}
