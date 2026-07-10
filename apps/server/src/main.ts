import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  // 全局前缀
  app.setGlobalPrefix('api/v1')

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  // CORS 配置（生产域名通过 CORS_ORIGINS 逗号分隔注入）
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  })

  // Swagger API 文档
  const config = new DocumentBuilder()
    .setTitle('Full愈 API')
    .setDescription('Full愈 品牌运营系统 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`🌿 Full愈 Server running on http://localhost:${port}`)
  console.log(`📚 API Docs: http://localhost:${port}/api/docs`)
}

bootstrap()
