import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors();
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, 
      forbidNonWhitelisted: true, 
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AdminHub API')
    .setDescription('Admin dashboard backend: auth, users, transactions, bookings and dashboard analytics.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  app.getHttpAdapter().get('/docs-json', (req, res) => {
  res.json(document);
});

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API running on http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger docs on http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
