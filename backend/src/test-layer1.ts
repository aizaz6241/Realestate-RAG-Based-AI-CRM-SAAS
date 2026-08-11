import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QueryUnderstandingService } from './ai-new/database/query-understanding.service';

async function bootstrap() {
  console.log('Bootstrapping app context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('App context created. Getting QueryUnderstandingService...');
  const service = app.get(QueryUnderstandingService);
  
  console.log('Testing query: "dubai last month sales"');
  try {
    const result = await service.analyzeQuery('dubai last month sales');
    console.log('\n--- Result ---\n');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
