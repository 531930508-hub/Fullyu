import { Module } from '@nestjs/common';
import { BrandCardsController } from './brand-cards.controller';
import { BrandCardsService } from './brand-cards.service';

@Module({
  controllers: [BrandCardsController],
  providers: [BrandCardsService],
  exports: [BrandCardsService]
})
export class CardsModule {}
