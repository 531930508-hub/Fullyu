import { Module } from '@nestjs/common'
import { ScmController } from './scm.controller'
import { ScmBasicService } from './scm-basic.service'
import { PurchaseService } from './purchase.service'
import { StockQueryService } from './stock-query.service'
import { StockModule } from './stock.service'
import { ScmLocationService } from './scm-location.service'
import { ScmBomService } from './scm-bom.service'
import { ScmTransferService } from './scm-transfer.service'
import { ScmProductionService } from './scm-production.service'
import { ScmPriceService } from './scm-price.service'
import { ApprovalModule } from '../approval/approval.module'

/**
 * 进销存模块：商品/供应商档案、库存地点、BOM、采购订单、验收入库、
 * 库存与调整、调拨、生产/委外工单。
 *
 * 库存原子操作单独放在 StockModule，审批引擎也依赖它，
 * 这里只依赖引擎发起审批，方向单一不成环。
 */
@Module({
  imports: [StockModule, ApprovalModule],
  controllers: [ScmController],
  providers: [
    ScmBasicService,
    PurchaseService,
    StockQueryService,
    ScmLocationService,
    ScmBomService,
    ScmTransferService,
    ScmProductionService,
    ScmPriceService,
  ],
  exports: [
    ScmBasicService,
    PurchaseService,
    StockQueryService,
    ScmLocationService,
    ScmBomService,
    ScmTransferService,
    ScmProductionService,
    ScmPriceService,
  ],
})
export class ScmModule {}
