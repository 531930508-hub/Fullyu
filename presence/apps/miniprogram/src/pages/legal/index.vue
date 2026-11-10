<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="page-heading" :style="{ paddingTop: headerTop + 'px' }">
      <text class="page-title serif">{{ tr('用户协议与隐私政策', 'Terms & privacy') }}</text>
      <text class="eyebrow">Legal</text>
    </view>
    <view class="content">
      <view class="legal-tabs">
        <button class="legal-tab" :class="{ active: tab === 'terms' }" @tap="tab = 'terms'">{{ tr('用户协议', 'Terms') }}</button>
        <button class="legal-tab" :class="{ active: tab === 'privacy' }" @tap="tab = 'privacy'">{{ tr('隐私政策', 'Privacy') }}</button>
        <button class="legal-tab" :class="{ active: tab === 'member' }" @tap="tab = 'member'">{{ tr('会员规则', 'Member rules') }}</button>
      </view>
      <view class="legal-doc">
        <text class="legal-updated">{{ tr('更新日期：2026年11月8日', 'Last updated: 8 November 2026') }}</text>
        <text class="legal-lead">{{ doc.lead }}</text>
        <view v-for="(section, index) in doc.sections" :key="index" class="legal-section">
          <text class="legal-h">{{ section.h }}</text>
          <text v-for="(paragraph, pIndex) in section.p" :key="pIndex" class="legal-p">{{ paragraph }}</text>
        </view>
        <text class="legal-foot">{{ doc.foot }}</text>
      </view>
    </view>
    <FloatingBack fallback="/pages/profile/index" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

/**
 * 《用户协议》《隐私政策》双语全文：文本适配自时叙版本，按在场业务改写
 * （课程预约、候补、会员卡、积分、开卡/签到照片核验、微信支付）。
 * 条款实质变更时更新日期并升级本文件版本。
 */
type LegalDoc = { lead: string; sections: { h: string; p: string[] }[]; foot: string }

const TERMS_ZH: LegalDoc = {
  lead: '欢迎使用 Full愈·在场小程序。使用本服务前，请阅读并理解以下条款；你点击同意或实际使用本服务，即表示接受本协议。',
  sections: [
    {
      h: '一、服务范围',
      p: [
        '在场小程序提供正念冥想、声音疗愈与身心整合等课程的浏览、报名、候补、支付、签到与评价服务，以及会员卡、积分与社群互动等权益服务。具体课程、排期、价格、名额与场地以页面展示为准。'
      ]
    },
    {
      h: '二、账号与身份',
      p: [
        '你需要使用本人微信授权的手机号登录。手机号是你的会员身份，请勿转借账号或冒用他人手机号；因账号转借造成的损失由使用人自行承担。'
      ]
    },
    {
      h: '三、报名与支付',
      p: [
        '提交报名时页面展示的课程、场次、地点、优惠与应付金额是本次交易的依据。支付由微信支付处理，我们不保存你的银行卡号或支付密码。',
        '课程满员时可支付预付款进入候补队列，有人取消时按顺序递补；截止未递补或你主动退出的，预付款全额退回。',
        '订单支付结果以小程序「我的预约」展示为准；请勿仅凭支付渠道提示认定报名已完成。'
      ]
    },
    {
      h: '四、上课与签到',
      p: [
        '请按课程安排的时间到达场地并签到。为核验到场身份，开卡与签到可能需要你提供本人照片；照片仅用于线下核验，管理规则见课程与会员页面说明。'
      ]
    },
    {
      h: '五、取消与退款',
      p: [
        '未支付订单可直接取消。已支付订单在开课前可自助取消，退款金额按课程详情页展示的退款规则核算；开课后不支持自助退款，如有特殊情况请通过「我的-联系客服」协商处理。',
        '退款原路退回你的支付账户，到账时间以支付渠道为准。'
      ]
    },
    {
      h: '六、会员卡与积分',
      p: [
        'Full愈年卡与月卡是在有效期内享受时叙、在场、轻疗会员权益的服务权益卡，不属于储值卡，不设余额或提现，不可转让、代付或找零。完整规则见「会员规则」。',
        '积分由 Full愈品牌会员中心统一记录，通过消费、活动与愈行之旅获得，不可购买、提现或转让，按批次到期；具体以积分说明与结算页为准。',
        '代金券有适用范围与有效期，不兑现、不找零，具体以券面说明为准。'
      ]
    },
    {
      h: '七、使用规范',
      p: [
        '你不得利用本服务恶意报名、占用名额、刷取优惠、批量注册、干扰系统运行、侵犯他人合法权益或从事违反法律法规的活动。'
      ]
    },
    {
      h: '八、知识产权',
      p: [
        '品牌名称、标识、页面设计、课程图片与文案归运营方或相应权利人所有。未经书面许可，不得复制、修改或用于商业用途。'
      ]
    },
    {
      h: '九、服务变更与中断',
      p: [
        '因系统维护、升级、网络故障或不可抗力，服务可能暂时中断。我们会尽量提前告知，并协助处理因此产生的订单问题。课程如需取消或改期，我们将按退款规则处理已支付订单。'
      ]
    },
    {
      h: '十、协议更新与联系',
      p: [
        '本协议更新后会在小程序内公布，重大变更会以显著方式提示。如有疑问，请通过「我的-联系客服」（服务时间 09:00–21:00）联系我们。'
      ]
    }
  ],
  foot: '本协议为小程序内的服务说明；正式经营主体信息以场地公示为准。'
}

const TERMS_EN: LegalDoc = {
  lead: 'Welcome to Full愈·Presence. Please read these terms before using the service. By agreeing or using the service, you accept them.',
  sections: [
    {
      h: '1. Service',
      p: [
        'The Presence mini program lets you browse, book, join waitlists, pay for and check in to mindfulness, sound healing and integrative mind-body classes, and use membership, points and community features. Classes, schedules, prices, capacity and venues are shown on the page.'
      ]
    },
    {
      h: '2. Account',
      p: [
        'You sign in with your own WeChat-authorised phone number. Your phone number is your membership identity; do not lend your account or use someone else’s number. Losses caused by lending an account are borne by the user.'
      ]
    },
    {
      h: '3. Booking and payment',
      p: [
        'When you submit a booking, the class, session, venue, discounts and amount shown on the page form the basis of the transaction. Payments are processed by WeChat Pay; we never store your card number or payment password.',
        'When a class is full you may prepay to join the waitlist; seats are offered in order when someone cancels. If no seat is offered by the deadline, or you withdraw, the prepayment is refunded in full.',
        'Payment results are shown in My Bookings; do not treat a payment-channel notification alone as proof of a completed booking.'
      ]
    },
    {
      h: '4. Attendance',
      p: [
        'Please arrive and check in on time. To verify attendance in person, membership activation and check-in may require your photo; photos are used only for offline verification under the rules shown on the class and membership pages.'
      ]
    },
    {
      h: '5. Cancellation and refunds',
      p: [
        'Unpaid orders can be cancelled directly. Paid orders can be cancelled by yourself before the class starts, with the refund calculated by the refund policy shown on the class page. After a class starts, self-service refunds are not supported; for special situations contact us via Me - Contact support.',
        'Refunds are returned to your original payment account; timing depends on the payment channel.'
      ]
    },
    {
      h: '6. Membership and points',
      p: [
        'The Full Yu annual and monthly cards are service-benefit cards for member pricing at Teahour, Presence and Retreat during the term. They are not stored-value cards: there is no balance or cash withdrawal, and they cannot be transferred, used to pay for others or exchanged for change. See Member rules for the full terms.',
        'Points are recorded centrally by the Full Yu membership centre, earned through spending, activities and the Journey game, and cannot be purchased, withdrawn or transferred. They expire in batches; see the points description and checkout page.',
        'Vouchers have applicable ranges and validity periods, cannot be exchanged for cash, and follow the terms shown on the voucher.'
      ]
    },
    {
      h: '7. Conduct',
      p: [
        'You may not maliciously book or hold seats, farm discounts, bulk-register accounts, interfere with the system, infringe others’ rights, or violate laws and regulations.'
      ]
    },
    {
      h: '8. Intellectual property',
      p: [
        'Brand names, logos, page design, class images and copy belong to the operator or the respective rights holders. Reproduction, modification or commercial use requires written permission.'
      ]
    },
    {
      h: '9. Changes and interruptions',
      p: [
        'The service may be interrupted for maintenance, upgrades, network failures or force majeure. We will notify you in advance where possible and help resolve affected orders. If a class is cancelled or rescheduled, paid orders follow the refund policy.'
      ]
    },
    {
      h: '10. Updates and contact',
      p: [
        'Updates to these terms are published in the mini program, with prominent notice for material changes. Questions? Contact us via Me - Contact support (09:00–21:00).'
      ]
    }
  ],
  foot: 'These terms are an in-app service description; the official operating entity is displayed at the venue.'
}

const PRIVACY_ZH: LegalDoc = {
  lead: '我们重视你的个人信息，并按照最小必要原则处理。本政策说明我们收集哪些信息、为何收集、如何保护，以及你可以如何管理这些信息。',
  sections: [
    {
      h: '一、适用范围',
      p: ['本政策适用于 Full愈·在场微信小程序。使用本服务前，请阅读并理解本政策。']
    },
    {
      h: '二、我们收集的信息',
      p: [
        '手机号：经你授权后由微信提供，用于会员身份、登录、订单与权益。',
        '微信 OpenID：用于识别账号与维持登录状态。',
        '头像与昵称：仅在你主动设置或填写时保存，用于个人资料展示。',
        '订单信息：课程、金额、场地与下单时间，用于履约、售后与对账。',
        '开卡与签到照片：仅在你主动上传时保存，用于线下到场身份核验。',
        '相册与相机（仅当你选择照片时）：用于设置头像或上传开卡照片，我们不会在你未操作时读取相册。',
        '相册（仅写入）：仅在你保存分享海报时写入图片，不会读取或上传你的相册。',
        '设备与运行日志：用于登录安全、故障排查与服务稳定。',
        '语言与浏览偏好：仅保存在你的设备本地。'
      ]
    },
    {
      h: '三、使用目的',
      p: [
        '我们使用上述信息完成课程报名与候补、会员与积分服务、处理售后、保障账号与交易安全、履行法律义务，并在不识别你个人身份的前提下改进服务体验。'
      ]
    },
    {
      h: '四、共享与委托处理',
      p: [
        '我们不会出售你的个人信息。仅在实现以下功能所必需的范围内共享：微信（登录、手机号授权、订阅消息与支付）、微信支付（收付款与退款）、云服务商（服务器与数据存储）。我们会要求合作方按约定保护你的信息。',
        '为提供 Full愈年卡在时叙、在场、轻疗三店通用的会员权益，你的手机号、会员编号、卡期与积分会在 Full愈品牌会员体系内共享，仅用于跨店识别会员身份、核销权益与内部结算，不用于与会员服务无关的用途。'
      ]
    },
    {
      h: '五、存储与保护',
      p: [
        '你的信息存储于中国境内，通过 HTTPS 加密传输，并采取访问控制与最小权限措施。保存期限为实现处理目的所必需；法律要求更长期限的，从其规定。'
      ]
    },
    {
      h: '六、你的权利',
      p: [
        '你可以在「我的-个人资料」查看并更正头像与昵称，在「我的」底部随时退出登录。如需注销账号或删除个人信息，请通过「我的-联系客服」提出，我们会在核实身份后处理；法律要求保留的交易记录除外。'
      ]
    },
    {
      h: '七、未成年人',
      p: [
        '未满十四周岁的未成年人应在监护人同意和指导下使用本服务。监护人可联系我们删除相关信息。'
      ]
    },
    {
      h: '八、第三方服务',
      p: [
        '小程序使用微信提供的基础能力，相关处理同时适用微信的隐私政策。通过小程序跳转的第三方页面由该第三方独立负责。'
      ]
    },
    {
      h: '九、政策更新与联系',
      p: [
        '本政策更新后会在小程序内公布，重大变更会以显著方式提示。如对本政策有疑问，请通过「我的-联系客服」（服务时间 09:00–21:00）联系我们。'
      ]
    }
  ],
  foot: '本政策为小程序内的隐私说明；正式经营主体信息以场地公示为准。'
}

const PRIVACY_EN: LegalDoc = {
  lead: 'We value your personal information and process it on a minimal-necessary basis. This policy explains what we collect, why, how we protect it, and how you can manage it.',
  sections: [
    {
      h: '1. Scope',
      p: ['This policy applies to the Full愈·Presence WeChat mini program. Please read it before using the service.']
    },
    {
      h: '2. Information we collect',
      p: [
        'Phone number: provided by WeChat after your authorisation, used for membership, sign-in, orders and benefits.',
        'WeChat OpenID: used to identify your account and keep you signed in.',
        'Avatar and nickname: stored only when you set them, used to display your profile.',
        'Order information: class, amount, venue and order time, used to fulfil orders, handle after-sales issues and reconcile accounts.',
        'Membership and check-in photos: stored only when you upload them, used to verify your attendance in person.',
        'Photo album and camera (only when you pick a photo): used to set your avatar or upload a membership photo; we never access your album without your action.',
        'Photo album (write-only): used only when you save a share poster; your album is never read or uploaded.',
        'Device and runtime logs: used for sign-in security, troubleshooting and service stability.',
        'Language and browsing preferences: stored only on your device.'
      ]
    },
    {
      h: '3. How we use it',
      p: [
        'We use this information to complete bookings and waitlists, membership and points services, handle after-sales issues, protect account and transaction security, meet legal obligations, and improve the service without identifying you personally.'
      ]
    },
    {
      h: '4. Sharing and processors',
      p: [
        'We do not sell your personal information. We share only what is necessary with WeChat (sign-in, phone authorisation, subscribe messages and payment), WeChat Pay (payments and refunds) and our cloud provider (servers and data storage). Partners are required to protect your information under our agreements.',
        'To provide Full Yu annual card benefits across Teahour, Presence and Retreat, your phone number, member number, card term and points are shared within the Full Yu membership programme. This is used only to recognise your membership across stores, redeem benefits and settle internally, not for unrelated purposes.'
      ]
    },
    {
      h: '5. Storage and protection',
      p: [
        'Your information is stored in mainland China, transmitted over HTTPS, and protected with access controls and least-privilege measures. We keep it only as long as needed for the purposes above, unless law requires a longer period.'
      ]
    },
    {
      h: '6. Your rights',
      p: [
        'You can view and correct your avatar and nickname under Me - Edit profile, and sign out any time at the bottom of Me. To close your account or delete your information, contact us via Me - Contact support; we will act after verifying your identity, except for transaction records we must retain by law.'
      ]
    },
    {
      h: '7. Minors',
      p: [
        'Anyone under 14 should use the service with a guardian’s consent and guidance. Guardians may contact us to delete related information.'
      ]
    },
    {
      h: '8. Third-party services',
      p: [
        'The mini program uses capabilities provided by WeChat; WeChat’s privacy policy also applies. Third-party pages opened from the mini program are independently responsible for their own handling.'
      ]
    },
    {
      h: '9. Updates and contact',
      p: [
        'Updates to this policy are published in the mini program, with prominent notice for material changes. Questions? Contact us via Me - Contact support (09:00–21:00).'
      ]
    }
  ],
  foot: 'This policy is an in-app privacy description; the official operating entity is displayed at the venue.'
}

const MEMBER_ZH: LegalDoc = {
  lead: '本规则适用于 Full愈年卡与月卡。开通前请确认卡种、价格、有效期与适用门店；开通即表示你已阅读并同意本规则。',
  sections: [
    {
      h: '一、卡的性质',
      p: [
        'Full愈年卡（¥299 / 365 天）与月卡（¥45 / 30 天）是在有效期内享受时叙、在场、轻疗会员权益的服务权益卡，不是储值卡。卡内不含可消费本金，不产生余额，不可提现、转账、代付或找零。'
      ]
    },
    {
      h: '二、有效期与续费',
      p: [
        '有效期自支付成功之日起算，以页面展示的到期日与剩余天数为准。',
        '续费不覆盖当前有效期，从当前有效期结束次日起接续；待生效的续费卡期可在生效前申请全额退款。',
        '有效期届满后权益自动停止；未使用的权益不折现、不结转。到期前 30 天页面会提示续费。'
      ]
    },
    {
      h: '三、权益范围',
      p: [
        '权益按业务配置：时叙、在场、轻疗分别提供页面展示的会员价或优惠。具体适用门店、商品、课程或项目与折扣，以开卡时锁定的配置、门店公示和结算页为准。',
        '会员价不与优惠券、积分抵扣、活动价叠加，同一笔消费按对你最有利的一种结算。',
        '在场畅练卡由在场单独销售与管理：有效期内不限次报课 0 元，并在同一有效期内免费赠送 Full愈 品牌大会员资格。已有品牌会员有效期更晚的，保留原会员；更早的，有效期自动接续到畅练卡截止日。在场的候补优先排位与课程会员阶梯价属于品牌会员权益。上课计价顺序为畅练卡 0 元、品牌会员价、原价，不叠加。'
      ]
    },
    {
      h: '四、积分',
      p: [
        '积分由 Full愈品牌会员中心统一记录，时叙、在场、轻疗共用一个积分账户。',
        '积分通过消费、活动与「愈行之旅」获得，不可购买、不可提现、不可转让，不构成预付款。',
        '积分按批次计算有效期，到期未使用自动失效；页面展示最近到期时间。',
        '轻疗结算时 1 积分可抵 ¥1，单笔可抵扣金额与可用范围以结算页为准；在场、时叙本期仅展示积分，暂不参与抵扣。',
        '「愈行之旅」骰子按会员在三店的实付金额累计获得，每满一定金额（以会员页显示为准）得 1 颗，零头累计到下一颗；骰子与途中礼物不可转让、不折现；订单全额退款的，该笔消费获得的骰子会相应扣回。'
      ]
    },
    {
      h: '五、退款',
      p: [
        '开通后 7 日内可申请无理由退款，退还实付金额；期间已领取的年卡礼（实物礼）按其标注价值扣除。',
        '超过 7 日的，按实付金额扣除已享会员优惠与已领取年卡礼价值后计算；已享优惠包括会员价差额、积分抵扣、赠品与活动优惠。计算结果为 0 或以下的，不予退款。',
        '通过会员码兑换、或随畅练卡等其他卡附赠的会员资格未单独付款，不涉及退款；附赠资格随原卡失效。',
        '退款原路退回，到账时间以支付渠道为准；已开具发票的，需按税务规定办理发票退回或红冲。特殊情况可联系门店伙伴，由工作人员核实后协商处理。'
      ]
    },
    {
      h: '六、会员码、好友邀请、会员故事与意见反馈',
      p: [
        '会员码由 Full愈 通过活动或合作渠道发放，每个码有名额、兑换截止日期与对应天数，以兑换结果为准；同一账号每个码限兑一次，会员码不可转售。',
        '品牌会员每月可在在场生成一定数量的好友邀请（以会员页显示为准）。好友登录后领取一张在场免费体验课券，每位好友限领一次，券有效期以领取结果为准，不可转让、不折现。',
        '有效会员可在会员页提交意见反馈。你勾选同意后，我们可能在匿名化处理（只保留姓氏）后将内容整理进「会员故事」，仅向会员展示。'
      ]
    },
    {
      h: '七、收款、发票与经营主体',
      p: [
        '会员卡由开通页面注明的业务主体销售并收款，发票由实际收款方开具。',
        '三店权益由各业务主体分别提供；会员身份、卡期与积分由 Full愈品牌会员中心统一记录，用于跨店识别与结算。',
        '场地调整、装修、暂停营业或迁址时，未使用权益按场地公示与本规则处理。'
      ]
    },
    {
      h: '八、个人信息',
      p: [
        '为提供三店通用权益，你的手机号、会员编号、卡期与积分会在 Full愈品牌会员体系内（时叙、在场、轻疗）共享；我们不会出售你的个人信息。',
        '详细处理规则见《隐私政策》。你可以在「我的-个人资料」查看、更正资料，或联系我们注销账号。'
      ]
    },
    {
      h: '九、其他',
      p: [
        '本规则是《用户协议》的组成部分；与《用户协议》不一致时，会员权益部分以本规则为准。',
        '已购卡期按开卡时锁定的权益与规则执行；规则更新会在小程序内公布，重大变更显著提示。',
        '如对权益、退款或积分有疑问，请通过「我的-联系客服」（服务时间 09:00–21:00）联系我们。'
      ]
    }
  ],
  foot: '本规则为小程序内的会员说明；正式经营主体信息以场地公示为准。'
}

const MEMBER_EN: LegalDoc = {
  lead: 'These rules apply to the Full Yu annual and monthly card. Please confirm the plan, price, term and participating stores before joining. Joining means you have read and accepted these rules.',
  sections: [
    {
      h: '1. What the card is',
      p: [
        'The Full Yu annual card (¥299 / 365 days) and monthly card (¥45 / 30 days) are service-benefit cards for member pricing at Teahour, Presence and Retreat during the term. They are not stored-value cards: there is no spendable principal or balance, and no cash withdrawal, transfer, payment on behalf of others or change.'
      ]
    },
    {
      h: '2. Term and renewal',
      p: [
        'The term starts when payment succeeds; the expiry date and remaining days shown in the app apply.',
        'Renewal does not overwrite the current term. It starts the day after the current term ends. A paid renewal that has not started can be fully refunded before it begins.',
        'When the term ends, benefits stop. Unused benefits are not converted to cash or carried forward. The app reminds you 30 days before expiry.'
      ]
    },
    {
      h: '3. Benefit scope',
      p: [
        'Benefits follow each business configuration. Teahour, Presence and Retreat each provide the member price or discount shown in the app. The participating stores, products, classes or services and discounts follow the configuration locked at purchase, in-store notices and the checkout page.',
        'Member prices do not stack with coupons, points or promotions; the single most favourable option applies to each purchase.',
        'The Presence Pass is sold and managed by Presence: classes cost ¥0 during its term, and it includes Full Yu brand membership for the same term. Priority waitlist seating and member tier prices at Presence are brand-member benefits. Class pricing applies the Pass (¥0) first, then the brand member price, then the list price; they do not stack.'
      ]
    },
    {
      h: '4. Points',
      p: [
        'Points are recorded in one ledger by the Full Yu membership centre and shared by Teahour, Presence and Retreat.',
        'Points are earned through spending, activities and the Journey game. They cannot be purchased, withdrawn or transferred, and are not prepayments.',
        'Points are held in batches with expiry dates. Unused points expire automatically; the app shows the nearest expiry date.',
        'At Retreat checkout, 1 point offsets ¥1. The amount and scope that can be offset follow the checkout page. Presence and Teahour display points only for now and do not accept point offsets.',
        'Journey dice are earned from the amount members actually pay across the three stores: 1 die for each threshold reached (as shown on the member page), with the remainder carried to the next die. Dice and journey gifts cannot be transferred or converted to cash; if an order is fully refunded, the dice earned from it are deducted.'
      ]
    },
    {
      h: '5. Refunds',
      p: [
        'Within 7 days of joining you may request a refund without giving a reason; the amount paid is refunded less the marked value of any annual gifts (physical gifts) already collected.',
        'After 7 days, the refund is the amount paid less member savings already enjoyed and the value of annual gifts collected. Savings include member-price savings, point offsets, gifts and promotional discounts. If the result is 0 or less, no refund is due.',
        'Membership redeemed with a member code, or included with another card such as the Presence Pass, was not paid for separately and is not refundable; included membership ends with the original card.',
        'Refunds are returned to the original payment method; timing depends on the payment channel. If an invoice has been issued, it must be returned or reversed under tax rules. For special circumstances, talk to our store team, who will verify and work it out with you.'
      ]
    },
    {
      h: '6. Member codes, friend invites, member stories and feedback',
      p: [
        'Member codes are issued by Full Yu through campaigns or partner channels. Each code has a quota, a redemption deadline and a number of days; the redemption result applies. Each account may redeem a code once, and codes cannot be resold.',
        'Brand members can create a number of friend invites at Presence each month (as shown on the member page). A friend who logs in receives one free Presence trial class voucher; each friend can claim once. The voucher validity follows the claim result, and it cannot be transferred or converted to cash.',
        'Active members can submit feedback on the member page. If you agree, we may anonymise it (keeping only your surname) and include it in Member Stories, which are shown to members only.'
      ]
    },
    {
      h: '7. Seller, invoices and operators',
      p: [
        'The card is sold and collected by the business named on the join page, and the invoice is issued by that payee.',
        'Benefits at the three stores are provided by each business. Member identity, card terms and points are recorded centrally by the Full Yu membership centre for cross-store recognition and settlement.',
        'If a venue is adjusted, renovated, suspended or relocated, unused benefits follow the venue notice and these rules.'
      ]
    },
    {
      h: '8. Personal information',
      p: [
        'To provide cross-store benefits, your phone number, member number, card term and points are shared within the Full Yu membership programme (Teahour, Presence and Retreat). We do not sell your personal information.',
        'See the Privacy Policy for details. You can view and correct your profile under Me - Profile, or contact us to close your account.'
      ]
    },
    {
      h: '9. Other',
      p: [
        'These rules form part of the Terms of Service. If they conflict on member benefits, these rules apply.',
        'Purchased terms follow the benefits and rules locked at purchase. Updates are published in the app and material changes are highlighted.',
        'For questions about benefits, refunds or points, contact us via Me - Contact support (09:00–21:00).'
      ]
    }
  ],
  foot: 'These rules describe membership in the app. The official operating entity is shown at each venue.'
}

const tab = ref<'terms' | 'privacy' | 'member'>('terms')
const doc = computed<LegalDoc>(() => {
  const en = isEnglish()
  if (tab.value === 'terms') return en ? TERMS_EN : TERMS_ZH
  if (tab.value === 'member') return en ? MEMBER_EN : MEMBER_ZH
  return en ? PRIVACY_EN : PRIVACY_ZH
})

onLoad((options: any) => {
  if (options?.tab === 'privacy') tab.value = 'privacy'
  else if (options?.tab === 'member') tab.value = 'member'
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.page-heading { padding: 96rpx 32rpx 24rpx; }
.page-title { display: block; font-size: 48rpx; }
.eyebrow { color: var(--c-muted); font-size: 22rpx; letter-spacing: 1rpx; }
.content { padding: 0 32rpx; }
.legal-tabs { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.legal-tab { flex: 1; min-height: 76rpx; margin: 0; border-radius: var(--radius-button); background: var(--c-card); color: var(--c-muted); font-size: 26rpx; line-height: 1.6; border: 2rpx solid transparent; }
.legal-tab.active { background: var(--c-card); color: var(--c-primary); border-color: var(--c-primary); font-weight: 600; }
button::after { border: none; }
.legal-doc { background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 36rpx; }
.legal-updated { display: block; color: var(--c-muted); font-size: 24rpx; margin-bottom: 20rpx; }
.legal-lead { display: block; font-size: 28rpx; line-height: 1.8; margin-bottom: 24rpx; }
.legal-section { margin-bottom: 28rpx; }
.legal-h { display: block; font-size: 30rpx; font-weight: 600; line-height: 1.6; margin-bottom: 12rpx; }
.legal-p { display: block; font-size: 26rpx; line-height: 1.9; color: var(--c-ink); }
.legal-foot { display: block; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; margin-top: 8rpx; }
</style>
