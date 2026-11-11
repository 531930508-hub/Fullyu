import { Global, Module } from '@nestjs/common'
import { AlertService } from './alert.service'

/** 全局模块：任何 service 都能注入 AlertService，不需要逐个模块 imports */
@Global()
@Module({
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}