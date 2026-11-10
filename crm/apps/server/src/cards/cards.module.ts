import { Module } from '@nestjs/common';
import { BrandCardsController } from './brand-cards.controller';
import { BrandCardsService } from './brand-cards.service';
import { BusinessCardsController } from './business-cards.controller';
import { BusinessCardsService } from './business-cards.service';

@Module({
  controllers: [BrandCardsController, BusinessCardsController],
  providers: [BrandCardsService, BusinessCardsService],
  exports: [BrandCardsService, BusinessCardsService]
})
export class CardsModule {}
