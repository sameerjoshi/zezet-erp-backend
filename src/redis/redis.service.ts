import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Thin wrapper over ioredis so the rest of the app injects a typed client.
// Used now for revocable refresh tokens; later for caching + BullMQ queues.
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    super(config.getOrThrow<string>('REDIS_URL'));
    // ioredis throws on unhandled 'error' events — log instead of crashing.
    this.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
