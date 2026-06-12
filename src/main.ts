import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Parse cookies so the refresh_token httpOnly cookie is readable (ADR 0001).
  app.use(cookieParser());

  // Credentials are enabled (refresh cookie), so the origin MUST be explicit —
  // a wildcard '*' is invalid with credentials. Require CORS_ORIGIN, don't guess.
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    throw new Error(
      'CORS_ORIGIN is required (credentials are enabled; no wildcard allowed)',
    );
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

  // Validate + strip unknown fields at the boundary.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // OpenAPI — the contract the frontend generates its typed client from.
  const config = new DocumentBuilder()
    .setTitle('Zezet ERP API')
    .setDescription('Trucking/logistics ERP — Panama')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Zezet ERP API on http://localhost:${port} (docs at /docs)`);
}
void bootstrap();
