import { Module } from '@nestjs/common';
import { SearchController } from './api/search.controller';
import { SearchService } from './application/search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
