<template>
  <view class="legal-page">
    <view class="legal-tabs">
      <button
        hover-class="none"
        class="legal-tab"
        :class="{ active: tab === 'terms' }"
        @click="switchTab('terms')"
      >
        {{ tt('用户协议', 'Terms of Service') }}
      </button>
      <button
        hover-class="none"
        class="legal-tab"
        :class="{ active: tab === 'privacy' }"
        @click="switchTab('privacy')"
      >
        {{ tt('隐私政策', 'Privacy Policy') }}
      </button>
      <button hover-class="none" class="legal-lang" @click="toggleLocale">{{ locale === 'en' ? '中文' : 'EN' }}</button>
    </view>

    <view class="legal-doc">
      <text class="legal-updated">{{ tt('更新日期：2026年11月1日', 'Last updated: 1 November 2026') }}</text>
      <text class="legal-lead">{{ doc.lead }}</text>
      <view v-for="(section, index) in doc.sections" :key="index" class="legal-section">
        <text class="legal-h">{{ section.h }}</text>
        <text v-for="(paragraph, pIndex) in section.p" :key="pIndex" class="legal-p">{{ paragraph }}</text>
      </view>
      <text class="legal-foot">{{ doc.foot }}</text>
    </view>
  </view>
</template>

<script>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const LOCALE_KEY = 'teahour.customer.locale';

const DOCS = {
  terms: {
    zh: {
      title: '用户协议',
      lead: '欢迎使用 Full愈·时叙小程序。使用本服务前，请阅读并理解以下条款；你点击同意或实际使用本服务，即表示接受本协议。',
      sections: [
        {
          h: '一、服务范围',
          p: [
            '时叙小程序提供茶饮与零售商品的浏览、下单、支付、到店取餐及会员权益服务。具体商品、价格、库存与营业时间以页面展示为准。'
          ]
        },
        {
          h: '二、账号与身份',
          p: [
            '你需要使用本人微信授权的手机号登录。手机号是你的会员身份，请勿转借账号或冒用他人手机号；因账号转借造成的损失由使用人自行承担。'
          ]
        },
        {
          h: '三、下单与支付',
          p: [
            '提交订单时页面展示的商品、数量、规格、优惠与应付金额是本次交易的依据。支付由微信支付及合作支付机构处理，我们不保存你的银行卡号或支付密码。',
            '订单支付结果以小程序订单页展示为准；请勿仅凭支付渠道提示认定订单已完成。'
          ]
        },
        {
          h: '四、制作与取餐',
          p: [
            '鲜酿茶在所选门店制作，制作完成后请凭订单号到取餐口取茶；零售商品凭提货码到支持门店领取。已出餐即视为可交付，到店出示订单号即可。'
          ]
        },
        {
          h: '五、取消与退款',
          p: [
            '未支付订单可直接取消。已支付订单在门店开始制作前，可联系门店协商取消并按原支付渠道退款；开始制作后，除质量原因外原则上不支持退款。退款到账时间以支付渠道为准。'
          ]
        },
        {
          h: '六、优惠券与会员权益',
          p: [
            '优惠券具有适用范围与有效期，不兑现、不找零、不可转让，具体以券面说明与结算页为准。会员权益以页面展示及实际结算金额为准。'
          ]
        },
        {
          h: '七、使用规范',
          p: [
            '你不得利用本服务恶意下单、刷取优惠、批量注册、干扰系统运行、侵犯他人合法权益或从事违反法律法规的活动。'
          ]
        },
        {
          h: '八、知识产权',
          p: [
            '品牌名称、标识、页面设计、商品图片与文案归运营方或相应权利人所有。未经书面许可，不得复制、修改或用于商业用途。'
          ]
        },
        {
          h: '九、服务变更与中断',
          p: [
            '因系统维护、升级、网络故障或不可抗力，服务可能暂时中断。我们会尽量提前告知，并协助处理因此产生的订单问题。'
          ]
        },
        {
          h: '十、协议更新与联系',
          p: [
            '本协议更新后会在小程序内公布，重大变更会以显著方式提示。如有疑问，请通过「我的 - 联系与帮助」或门店伙伴联系我们。'
          ]
        }
      ],
      foot: '本协议为小程序内的服务说明；正式经营主体信息以门店公示为准。'
    },
    en: {
      title: 'Terms of Service',
      lead: 'Welcome to Full愈·Teahour. Please read these terms before using the service. By agreeing or using the service, you accept them.',
      sections: [
        {
          h: '1. Service',
          p: [
            'The Teahour mini program lets you browse tea and retail products, place and pay for orders, collect in store and use member benefits. Products, prices, availability and opening hours are shown on the page.'
          ]
        },
        {
          h: '2. Account and identity',
          p: [
            'You sign in with a phone number authorised through WeChat. Your phone number is your member identity. Do not lend your account or use someone else’s phone number.'
          ]
        },
        {
          h: '3. Orders and payment',
          p: [
            'The products, quantity, options, discounts and amount shown when you submit an order form the basis of the transaction. Payments are handled by WeChat Pay and partner payment institutions; we do not store card numbers or payment passwords.',
            'The order status in the mini program is authoritative. Do not treat a payment-channel message alone as proof that an order is complete.'
          ]
        },
        {
          h: '4. Preparation and collection',
          p: [
            'Fresh tea is made at the selected store. Once prepared, collect it at the counter with your order number. Retail items are collected with the pickup code at a supporting store. A ready order can be collected by showing the order number.'
          ]
        },
        {
          h: '5. Cancellation and refunds',
          p: [
            'Unpaid orders can be cancelled directly. Before preparation starts, paid orders may be cancelled by contacting the store and are refunded to the original payment method. After preparation starts, refunds are not available except for quality issues. Refund timing depends on the payment channel.'
          ]
        },
        {
          h: '6. Coupons and member benefits',
          p: [
            'Coupons have eligibility rules and expiry dates, cannot be exchanged for cash, give change or be transferred, and are subject to the coupon terms and checkout page. Member benefits follow the page and the final amount charged.'
          ]
        },
        {
          h: '7. Fair use',
          p: [
            'You must not place malicious orders, abuse discounts, mass-register, disrupt the system, infringe others’ rights or engage in unlawful activity.'
          ]
        },
        {
          h: '8. Intellectual property',
          p: [
            'Brand names, marks, page design, product images and copy belong to the operator or the relevant rights holders. They may not be copied, modified or used commercially without written permission.'
          ]
        },
        {
          h: '9. Changes and interruptions',
          p: [
            'The service may be suspended for maintenance, upgrades, network failures or events beyond our control. We will give notice where possible and help resolve affected orders.'
          ]
        },
        {
          h: '10. Updates and contact',
          p: [
            'Updated terms are published in the mini program, and material changes will be highlighted. For questions, contact us through “Me - Help & contact” or a store partner.'
          ]
        }
      ],
      foot: 'These terms describe the service in the mini program. The operating entity is shown at each store.'
    }
  },
  privacy: {
    zh: {
      title: '隐私政策',
      lead: '我们重视你的个人信息，并按照最小必要原则处理。本政策说明我们收集哪些信息、为何收集、如何保护，以及你可以如何管理这些信息。',
      sections: [
        {
          h: '一、适用范围',
          p: ['本政策适用于 Full愈·时叙微信小程序。使用本服务前，请阅读并理解本政策。']
        },
        {
          h: '二、我们收集的信息',
          p: [
            '手机号：经你授权后由微信提供，用于会员身份、登录、订单与权益。',
            '微信 OpenID：用于识别账号与维持登录状态。',
            '头像、姓名、生日、性别：仅在你主动填写时保存，用于会员资料展示。',
            '订单信息：商品、金额、门店、取餐方式与下单时间，用于履约、售后与对账。',
            '定位信息：仅在你开启定位时读取，用于计算门店距离与排序；不开启不影响浏览、下单与取餐。',
            '相册（仅写入）：仅在你保存分享海报时写入图片，不会读取或上传你的相册。',
            '设备与运行日志：用于登录安全、故障排查与服务稳定。',
            '购物袋与语言偏好：仅保存在你的设备本地。'
          ]
        },
        {
          h: '三、使用目的',
          p: [
            '我们使用上述信息完成订单与会员服务、处理售后、保障账号与交易安全、履行法律义务，并在不识别你个人身份的前提下改进服务体验。'
          ]
        },
        {
          h: '四、共享与委托处理',
          p: [
            '我们不会出售你的个人信息。仅在实现以下功能所必需的范围内共享：微信（登录、手机号授权与支付）、支付服务商（汇付天下，用于收付款与退款）、云服务商（服务器与数据存储）。我们会要求合作方按约定保护你的信息。'
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
            '你可以在「我的 - 个人资料」查看并更正姓名、头像、生日与性别，可以在微信设置中关闭定位授权。如需注销账号或删除个人信息，请通过门店伙伴或「联系与帮助」提出，我们会在核实身份后处理；法律要求保留的交易记录除外。'
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
            '本政策更新后会在小程序内公布，重大变更会以显著方式提示。如对本政策有疑问，请通过「我的 - 联系与帮助」或门店伙伴联系我们。'
          ]
        }
      ],
      foot: '本政策为小程序内的隐私说明；正式经营主体信息以门店公示为准。'
    },
    en: {
      title: 'Privacy Policy',
      lead: 'We value your personal information and process it on a minimal-necessary basis. This policy explains what we collect, why, how we protect it, and how you can manage it.',
      sections: [
        {
          h: '1. Scope',
          p: ['This policy applies to the Full愈·Teahour WeChat mini program. Please read it before using the service.']
        },
        {
          h: '2. Information we collect',
          p: [
            'Phone number: provided by WeChat after your authorisation, used for membership, sign-in, orders and benefits.',
            'WeChat OpenID: used to identify your account and keep you signed in.',
            'Avatar, name, birthday and gender: stored only if you choose to add them, used to display your member profile.',
            'Order information: products, amount, store, collection method and order time, used to fulfil orders, handle after-sales issues and reconcile accounts.',
            'Location: read only when you enable it, used to calculate store distance and order. Not enabling it does not affect browsing, ordering or collection.',
            'Photo album (write-only): used only when you save a share poster; your album is never read or uploaded.',
            'Device and runtime logs: used for sign-in security, troubleshooting and service stability.',
            'Bag and language preference: stored only on your device.'
          ]
        },
        {
          h: '3. How we use it',
          p: [
            'We use this information to complete orders and membership services, handle after-sales issues, protect account and transaction security, meet legal obligations, and improve the service without identifying you personally.'
          ]
        },
        {
          h: '4. Sharing and processors',
          p: [
            'We do not sell your personal information. We share only what is necessary with WeChat (sign-in, phone authorisation and payment), our payment provider (Huifu, for payments and refunds) and our cloud provider (servers and data storage). Partners are required to protect your information under our agreements.'
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
            'You can view and correct your name, avatar, birthday and gender under “Me - Profile”, and turn off location in WeChat settings. To close your account or delete your information, contact a store partner or use “Help & contact”; we will act after verifying your identity, except for transaction records we must retain by law.'
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
            'The mini program uses WeChat capabilities, and those processing activities are also governed by WeChat’s privacy policy. Third-party pages opened from the mini program are the responsibility of that third party.'
          ]
        },
        {
          h: '9. Updates and contact',
          p: [
            'Updated policies are published in the mini program, and material changes will be highlighted. For questions, contact us through “Me - Help & contact” or a store partner.'
          ]
        }
      ],
      foot: 'This policy describes privacy practices in the mini program. The operating entity is shown at each store.'
    }
  }
};

export default {
  setup() {
    const tab = ref('privacy');
    const stored = uni.getStorageSync(LOCALE_KEY);
    const locale = ref(stored === 'en' ? 'en' : 'zh');

    onLoad((query) => {
      tab.value = query && query.tab === 'terms' ? 'terms' : 'privacy';
      applyTitle();
    });

    const doc = computed(() => DOCS[tab.value][locale.value]);

    function applyTitle() {
      uni.setNavigationBarTitle({ title: doc.value.title });
    }

    function switchTab(next) {
      if (tab.value === next) return;
      tab.value = next;
      applyTitle();
    }

    function toggleLocale() {
      locale.value = locale.value === 'en' ? 'zh' : 'en';
      applyTitle();
    }

    const tt = (zh, en) => (locale.value === 'en' ? en : zh);

    return { tab, locale, doc, tt, switchTab, toggleLocale };
  }
};
</script>

<style>
page { background: var(--paper, #f6f4ef); }

.legal-page {
  min-height: 100vh;
  padding: 8px 20px calc(40px + env(safe-area-inset-bottom));
  background: var(--paper, #f6f4ef);
  color: var(--ink, #241f1a);
}

.legal-tabs {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--line, #dedbd3);
  position: sticky;
  top: 0;
  background: var(--paper, #f6f4ef);
  z-index: 2;
}

.legal-tab {
  padding: 6px 0;
  font-size: 14px;
  color: var(--muted, #8a837a);
  background: transparent;
  border: 0;
  line-height: 1.4;
}

.legal-tab.active {
  color: var(--ink, #241f1a);
  font-weight: 600;
  border-bottom: 2px solid var(--wood, #694b3d);
}

.legal-lang {
  margin-left: auto;
  padding: 4px 10px;
  min-height: 30px;
  font-size: 12px;
  color: var(--wood, #694b3d);
  background: transparent;
  border: 1px solid var(--line, #dedbd3);
  border-radius: 999px;
  line-height: 1;
}

.legal-doc { padding: 18px 0 0; }

.legal-updated {
  display: block;
  font-size: 11px;
  color: var(--muted, #8a837a);
  margin-bottom: 12px;
}

.legal-lead {
  display: block;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink, #241f1a);
  margin-bottom: 6px;
}

.legal-section { margin-top: 18px; }

.legal-h {
  display: block;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  margin-bottom: 6px;
}

.legal-p {
  display: block;
  font-size: 13px;
  line-height: 1.8;
  color: #4b453f;
  margin-bottom: 6px;
}

.legal-foot {
  display: block;
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--line, #dedbd3);
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted, #8a837a);
}
</style>
