<template>
  <view class="app" :class="{ 'locale-en': locale === 'en' }" :style="{ paddingTop: statusBarPx + 'px' }">
    <view class="mini-header" :style="headerStyle">
      <view class="brand" role="img" :aria-label="locale === 'en' ? 'Full愈 · Tea Hour' : 'Full愈·时叙'">
        <image
          class="mini-logo"
          :class="{ en: locale === 'en' }"
          :src="locale === 'en' ? '/static/logo-en.png' : '/static/logo-zh.png'"
          aria-hidden="true"
          mode="aspectFit"
        />
      </view>
      <!-- 与在场一致：品牌靠左上，语言切换贴在微信胶囊正下方。 -->
      <button hover-class="none" class="language-switch" :style="langStyle" :aria-label="tt('切换到英文', 'Switch to Chinese')" @click="toggleLocale">
        {{ locale === 'zh' ? 'EN' : '中' }}
      </button>
    </view>

    <scroll-view scroll-y class="phone-content" :scroll-top="scrollTop">
      <view class="screen">
        <view v-if="!ready" class="mini-pad section-space">
          <view v-if="state.error && !state.loading" class="empty">
            <text class="empty-title">{{ tt('暂时连不上茶席', 'The tea counter is offline') }}</text>
            <text class="small muted">{{ state.error }}</text>
            <button hover-class="none" class="btn primary" @click="retry">{{ tt('重新连接', 'Try again') }}</button>
          </view>
          <view v-else class="loading-block">
            <view class="spinner" />
            <text>{{ tt('正在准备茶席', 'Preparing your tea') }}</text>
          </view>
        </view>

        <template v-else>
          <!-- ------------------------------ 此刻 ------------------------------ -->
          <template v-if="screen === 'home'">
            <view class="location-bar">
              <button hover-class="none" class="store-trigger" @click="openStores">
                <AppIcon name="pin" :size="17" />
                <view class="trigger-text">
                  <text class="trigger-name">{{ storeChosen ? sn(state.store) : tt('请选择取茶门店', 'Choose a tea store') }}</text>
                  <text class="trigger-desc">
                    {{ storeChosen ? tt(state.store.address, state.store.addressEn) : tt('点击选择门店', 'Tap to choose') }}
                  </text>
                </view>
                <AppIcon name="chevronRight" :size="14" />
              </button>
              <button hover-class="none" class="text-btn" @click="openTableScan">
                <AppIcon name="qr" :size="15" />
                <text>{{ tt('扫桌签', 'Table QR') }}</text>
              </button>
            </view>

            <!-- 后台配置了轮播时展示整张成品图，点击按后台设定的站内去处跳转；
                 未配置时保留默认品牌主视觉，避免首屏出现空白广告位。 -->
            <swiper
              v-if="homeBanners.length"
              class="home-banner"
              :circular="homeBanners.length > 1"
              :autoplay="homeBanners.length > 1"
              :interval="5000"
              :duration="450"
              indicator-dots
              indicator-color="rgba(253, 250, 244, 0.36)"
              indicator-active-color="#fdfaf4"
            >
              <swiper-item v-for="banner in homeBanners" :key="banner.id">
                <button
                  hover-class="none"
                  class="home-banner-slide"
                  :aria-label="tt('查看首页活动', 'View this promotion')"
                  @click="onBannerTap(banner)"
                >
                  <image class="home-banner-img" :src="banner.imageUrl" mode="aspectFill" />
                </button>
              </swiper-item>
            </swiper>
            <view v-else class="tea-hero">
              <image class="hero-bg" src="/static/tea.webp" aria-hidden="true" mode="aspectFill" />
              <view class="hero-scrim" />
              <view class="hero-body">
                <text class="eyebrow">A MOMENT, ALL YOURS</text>
                <view class="hero-title">
                  <text class="hero-line">{{ tt('一杯茶，', 'A moment.') }}</text>
                  <text class="hero-line">{{ tt('回到此刻。', 'Just for you.') }}</text>
                </view>
                <text class="hero-sub">{{ tt('Full愈·时叙 · 纯茶鲜酿', 'Freshly brewed, pure tea') }}</text>
              </view>
            </view>

            <!-- 只看仍在进行、且已支付到店的订单；已完成、取消和未支付都不挂在首页。
                 已出餐优先并直接露出取餐号，制作中只做轻提示。 -->
            <button
              hover-class="none"
              v-if="state.customer && resumePickup"
              class="resume-strip"
              :class="{ ready: resumeReady }"
              @click="resumeReceipt"
            >
              <view class="resume-icon">
                <AppIcon name="cup" :size="16" />
              </view>
              <view class="grow">
                <view class="resume-line">
                  <text class="resume-title">{{ resumeTitle }}</text>
                  <text v-if="resumeCode" class="resume-code" :class="{ muted: !resumeReady }">{{ resumeCode }}</text>
                </view>
                <text class="resume-sub">{{ resumeSub }}</text>
              </view>
              <AppIcon name="arrowRight" :size="16" />
            </button>

            <view class="mini-pad">
              <view class="section-title">
                <text class="section-heading">{{ tt('这一刻，想怎么过？', 'How is your moment?') }}</text>
                <button hover-class="none" class="text-btn" @click="openMenu('all')">
                  <text>{{ tt('看茶单', 'Tea menu') }}</text>
                  <AppIcon name="arrowRight" :size="14" />
                </button>
              </view>
              <view class="series-grid">
                <button hover-class="none"
                  v-for="key in seriesKeys"
                  :key="key"
                  class="series-card series-card-art"
                  :class="SERIES[key].color"
                  :aria-label="tt(`选择${SERIES[key].name}系列`, SERIES[key].nameEn)"
                  @click="openMenu(key)"
                >
                  <!-- 系列卡使用中英文两套成品图，文案与图形已包含在图内。 -->
                  <image class="series-art" :src="seriesArt(key)" mode="widthFix" />
                </button>
              </view>

              <button hover-class="none" v-if="bottle" class="celebrate-strip" @click="detail = bottle">
                <image class="cover" src="/static/celebration.webp" aria-hidden="true" mode="aspectFill" lazy-load />
                <view class="grow">
                  <text class="eyebrow">CELEBRATE THE EVERYDAY</text>
                  <text class="celebrate-title">{{ tt('让这一刻，值得碰杯。', 'Here’s to this moment.') }}</text>
                  <text class="celebrate-sub">{{ pn(bottle) }} · {{ money(bottle.priceCents) }}</text>
                </view>
                <AppIcon name="arrowRight" :size="18" />
              </button>

              <view class="tiny muted section-space">{{ tt('纯茶与香气，留一点时间给自己。', 'Pure tea and aroma, a little time for yourself.') }}</view>
            </view>
          </template>

          <!-- ------------------------------ 茶单 ------------------------------ -->
          <template v-else-if="screen === 'menu'">
            <view class="location-bar">
              <button hover-class="none" class="store-trigger" @click="openStores">
                <AppIcon name="pin" :size="17" />
                <view class="trigger-text">
                  <text class="trigger-name">{{ storeChosen ? sn(state.store) : tt('请选择取茶门店', 'Choose a tea store') }}</text>
                  <text class="trigger-desc">
                    {{ storeChosen ? tt(state.store.address, state.store.addressEn) : tt('点击选择门店', 'Tap to choose') }}
                  </text>
                </view>
                <AppIcon name="chevronRight" :size="14" />
              </button>
              <button hover-class="none" class="text-btn" @click="openTableScan">
                <AppIcon name="qr" :size="15" />
                <text>{{ tt('扫桌签', 'Table QR') }}</text>
              </button>
            </view>

            <view class="page-heading">
              <text class="eyebrow">THE TEA MENU</text>
              <text class="heading-title">{{ tt('喜欢的茶，直接点。', 'Find your kind of tea.') }}</text>
              <text class="heading-sub">{{ tt('四个系列，五种香气线索。', 'Four moments. Five aroma inspirations.') }}</text>
            </view>

            <view class="chips">
              <button hover-class="none" :class="{ active: menuSeries === 'all' }" @click="pickSeries('all')">{{ tt('全部', 'All') }}</button>
              <button hover-class="none"
                v-for="key in seriesKeys"
                :key="key"
                :class="{ active: menuSeries === key }"
                @click="pickSeries(key)"
              >
                {{ locale === 'en' ? SERIES[key].nameEn : SERIES[key].name }}
              </button>
            </view>

            <view class="search">
              <AppIcon name="search" :size="16" />
              <input
                :value="menuQuery"
                :placeholder="tt('找茶名，或喜欢的香气', 'Search a tea or an aroma')"
                confirm-type="search"
                @input="onSearch"
              />
            </view>

            <view class="chips">
              <button hover-class="none"
                v-for="value in tempOptions"
                :key="value"
                :class="{ active: menuTemp === value }"
                @click="menuTemp = value"
              >
                {{ value === '全部' ? tt('冷热都可以', 'All temperatures') : sp(value) }}
              </button>
            </view>

            <view class="product-list">
              <template v-if="menuGroups.length">
                <view v-for="group in menuGroups" :key="group.key" class="menu-group-block">
                  <view v-if="menuSeries === 'all'" class="menu-series-head">
                    <text class="menu-series-name">{{ locale === 'en' ? SERIES[group.key].nameEn : SERIES[group.key].name }}</text>
                    <view class="menu-series-side">
                      <text class="menu-series-tag">{{ SERIES[group.key].lineEn }}</text>
                      <SeriesMotif :series="group.key" color="#b9a68e" class="series-head-motif" />
                    </view>
                  </view>
                  <view v-for="block in group.groups" :key="block.key" class="menu-cat-block">
                    <view class="menu-cat-head">
                      <text class="menu-cat-name">{{ locale === 'en' ? block.titleEn : block.title }}</text>
                      <text v-if="locale !== 'en'" class="menu-cat-en">{{ block.titleEn }}</text>
                      <view class="menu-cat-rule" />
                    </view>
                    <view class="product-rows">
                      <view v-for="product in block.items" :key="product.id" class="product-row">
                      <ProductArt :product="product" />
                      <view class="grow">
                        <button hover-class="none" class="product-hit" @click="detail = product">
                          <text class="product-name">{{ pn(product) }}</text>
                          <view class="meta-line">
                            <text class="tag">
                              {{ tt(product.tag || product.spec, product.tagEn || product.specEn || product.nameEn || product.tag || '') }}
                            </text>
                            <text v-if="product.kind === 'tea' && product.temps && product.temps.length" class="temp-note">
                              {{ product.temps.map(sp).join(' · ') }}
                            </text>
                          </view>
                        </button>
                        <view class="flex between">
                          <view>
                            <text class="price">{{ money(product.priceCents) }}</text>
                            <text class="tiny muted"> / {{ tt(product.unit, product.unitEn || product.unit) }}</text>
                            <view v-if="product.memberEligible && memberPerCup > 0" class="tiny muted">
                              {{ tt(`大会员每杯立减 ${money(memberPerCup)}`, `Members save ${money(memberPerCup)} per cup`) }}
                            </view>
                          </view>
                          <button hover-class="none"
                            v-if="product.available !== false"
                            :id="`add-${product.id}`"
                            class="add-btn"
                            :class="{ 'has-count': freshQty(product.id) > 0, 'just-added': recentAddId === product.id }"
                            :aria-label="`${tt('添加', 'Add ')}${pn(product)}`"
                            @click="quickAddTea(product)"
                          >
                            <AppIcon name="plus" :size="18" color="#fffefa" />
                            <text v-if="freshQty(product.id)" class="add-count">{{ freshQty(product.id) }}</text>
                          </button>
                          <text v-else class="pill">{{ tt('售罄', 'Sold out') }}</text>
                        </view>
                      </view>
                    </view>
                    </view>
                  </view>
                </view>
              </template>
              <view v-else class="empty">
                <AppIcon name="cup" :size="35" />
                <text class="empty-title">{{ tt('这一刻，换一种选择', 'Try another choice') }}</text>
                <text class="small">{{ tt('当前筛选下没有茶饮。', 'No teas match these filters.') }}</text>
                <button hover-class="none" class="btn" @click="clearFilters">{{ tt('清除筛选', 'Clear filters') }}</button>
              </view>
            </view>
          </template>

          <!-- ------------------------------ 零售 ------------------------------ -->
          <template v-else-if="screen === 'retail'">
            <view class="retail-intro">
              <view class="grow">
                <text class="eyebrow">A RITUAL TO TAKE HOME</text>
                <view class="heading-title">
                  <text class="title-line">{{ tt('喜欢的茶，', 'Take a little') }}</text>
                  <text class="title-line">{{ tt('留在日常。', 'ritual home.') }}</text>
                </view>
                <text class="small">{{ tt('茶包 · 手冲 · 盒装茶', 'Tea bags · Pour-over · Tea boxes') }}</text>
              </view>
              <ProductArt v-if="retailFeature" :product="retailFeature" />
              <ProductArt
                v-else
                :product="{ id: 'retail', name: '时叙茶盒', series: 'retail', kind: 'retail', categoryId: 'boxes' }"
              />
            </view>

            <view class="mini-pad">
              <view class="pickup-promise">
                <AppIcon name="store" :size="21" />
                <view>
                  <text class="pickup-promise-title">{{ tt('下单后，任意门店领取', 'Order here. Collect at any store.') }}</text>
                </view>
              </view>
            </view>

            <view class="chips">
              <button hover-class="none" :class="{ active: retailCategory === 'all' }" @click="retailCategory = 'all'">{{ tt('全部', 'All') }}</button>
              <button hover-class="none"
                v-for="item in retailCats"
                :key="item.id"
                :class="{ active: retailCategory === item.id }"
                @click="retailCategory = item.id"
              >
                {{ tt(item.name, item.nameEn) }}
              </button>
            </view>

            <view class="product-list">
              <view v-if="retailList.length" class="product-rows">
                <view v-for="item in retailList" :key="item.id" class="product-row">
                  <ProductArt :product="{ id: item.id, name: item.name, series: 'retail', kind: 'retail', categoryId: categoryOf(item.id), imageUrl: item.imageUrl }" />
                  <view class="grow">
                    <button hover-class="none" class="product-hit" @click="openRetailDetail(item, categoryOf(item.id))">
                      <text class="product-name">{{ item.name }}</text>
                      <text class="tag">{{ tt('零售装', 'Retail pack') }}</text>
                    </button>
                    <view class="flex between">
                      <view>
                        <text class="price">{{ money(item.priceCents) }}</text>
                        <view class="tiny muted">
                          {{ tt(`支持 ${item.stores} 家门店领取`, `Pickup at ${item.stores} stores`) }}
                        </view>
                      </view>
                      <button hover-class="none"
                        :id="`retail-add-${item.id}`"
                        class="add-btn"
                        :class="{ 'has-count': retailQty(item.id) > 0, 'just-added': recentAddId === item.id }"
                        :aria-label="`${tt('添加', 'Add ')}${item.name}`"
                        @click="quickAddRetail(item, categoryOf(item.id))"
                      >
                        <AppIcon name="plus" :size="18" color="#fffefa" />
                        <text v-if="retailQty(item.id)" class="add-count">{{ retailQty(item.id) }}</text>
                      </button>
                    </view>
                  </view>
                </view>
              </view>
              <view v-else class="empty">
                <AppIcon name="package" :size="35" />
                <text class="empty-title">{{ tt('新品正在路上', 'More tea is on its way') }}</text>
                <text class="small">{{ tt('这个分类还没有上架商品。', 'No published items in this category yet.') }}</text>
              </view>
            </view>
          </template>

          <!-- ------------------------------ 确认订单 ------------------------------ -->
          <template v-else-if="screen === 'checkout'">
            <view class="page-heading">
              <text class="eyebrow">YOUR ORDER</text>
              <text class="heading-title">{{ tt('确认这一单', 'Make it yours.') }}</text>
            </view>

            <view v-if="checkoutEmpty" class="empty">
              <AppIcon name="bag" :size="35" />
              <text class="empty-title">{{ tt('购物袋还是空的', 'Your bag is empty') }}</text>
              <text class="small">{{ tt('先去选喜欢的茶吧。', 'Find something you love.') }}</text>
              <button hover-class="none" class="btn primary" @click="backFromCheckout">{{ tt('继续选购', 'Browse tea') }}</button>
            </view>

            <template v-else>
              <view v-if="checkoutRetail" class="mini-card pickup-promise">
                <AppIcon name="package" :size="24" />
                <view>
                  <text class="pickup-promise-title">{{ tt('任意门店领取', 'Pickup at any store') }}</text>
                  <text class="pickup-promise-sub">
                    {{ tt('到店出示 4 位提货码领取。', 'Show your 4-digit pickup code in store.') }}
                  </text>
                </view>
              </view>

              <view v-else class="mini-card">
                <view class="flex between">
                  <view class="grow">
                    <text class="card-title">{{ storeChosen ? sn(state.store) : tt('请选择取茶门店', 'Choose a tea store') }}</text>
                    <text class="tiny muted">
                      {{ storeChosen
                        ? [tt(state.store.address, state.store.addressEn), distanceText(state.store), state.store.hours].filter(Boolean).join(' · ')
                        : tt('选择你实际到访的门店', 'Choose the store you will visit') }}
                    </text>
                  </view>
                  <button hover-class="none" class="text-btn" @click="openStores">{{ tt('更换', 'Change') }}</button>
                </view>
                <view class="mode-toggle checkout-mode">
                  <button hover-class="none" :class="{ active: state.dining === 'dine' }" @click="setDining('dine')">{{ tt('店内享用', 'Dine in') }}</button>
                  <button hover-class="none" :class="{ active: state.dining === 'takeaway' }" @click="setDining('takeaway')">{{ tt('现场外带', 'Takeaway') }}</button>
                </view>
                <template v-if="state.dining === 'dine'">
                  <view class="seat-status section-space">
                    <view class="grow">
                      <text class="tiny muted">{{ tt('送到你的位置', 'Your seat') }}</text>
                      <text class="seat-status-value">{{ state.seat ? sp(state.seat) : tt('吧台取餐口自取', 'Counter pickup') }}</text>
                      <text class="tiny muted">
                        {{
                          state.seat
                            ? tt('换桌时重新扫码即可。', 'Rescan when you change tables.')
                            : tt('扫桌签送到座位，或到吧台自取。', 'Scan your table QR or collect at the counter.')
                        }}
                      </text>
                    </view>
                    <button hover-class="none" class="text-btn" @click="openTableScan">
                      {{ state.seat ? tt('重新扫码', 'Rescan') : tt('扫桌签', 'Scan table') }}
                    </button>
                  </view>
                </template>
                <text v-else class="tiny muted">{{ tt('做好后到出餐口取茶。', 'Collect at the counter when ready.') }}</text>
              </view>

              <view class="mini-card">
                <template v-if="checkoutRetail">
                  <view v-for="line in state.retailCart" :key="line.key" class="checkout-item">
                    <ProductArt :product="retailArt(line)" />
                    <view class="grow">
                      <text class="checkout-name">{{ line.item.name }}</text>
                      <text class="tiny muted">{{ tt('零售装', 'Retail pack') }} · {{ tt('任意门店领取', 'Any-store pickup') }}</text>
                      <text class="small checkout-amount">{{ money(line.item.priceCents * line.qty) }}</text>
                    </view>
                    <view class="qty">
                      <button hover-class="none" class="cart-qty" :aria-label="tt('减少', 'Decrease')" @click="decreaseQty('retail', line.key)">
                        <AppIcon name="minus" :size="12" />
                      </button>
                      <text class="qty-num">{{ line.qty }}</text>
                      <button hover-class="none" class="cart-qty" :aria-label="tt('增加', 'Increase')" @click="changeQty('retail', line.key, 1)">
                        <AppIcon name="plus" :size="12" />
                      </button>
                    </view>
                  </view>
                </template>
                <template v-else>
                  <view v-for="line in state.freshCart" :key="line.key" class="checkout-item">
                    <ProductArt :product="line.product" />
                    <view class="grow">
                      <text class="checkout-name">{{ pn(line.product) }}</text>
                      <text class="tiny muted">{{ [line.temp, line.temp === '热' ? '' : line.ice].filter(Boolean).map(sp).join(' · ') }}</text>
                      <text class="small checkout-amount">{{ money(line.product.priceCents * line.qty) }}</text>
                    </view>
                    <view class="qty">
                      <button hover-class="none" class="cart-qty" :aria-label="tt('减少', 'Decrease')" @click="decreaseQty('fresh', line.key)">
                        <AppIcon name="minus" :size="12" />
                      </button>
                      <text class="qty-num">{{ line.qty }}</text>
                      <button hover-class="none" class="cart-qty" :aria-label="tt('增加', 'Increase')" @click="changeQty('fresh', line.key, 1)">
                        <AppIcon name="plus" :size="12" />
                      </button>
                    </view>
                  </view>
                </template>
              </view>

              <view class="mini-card">
                <text v-if="!checkoutRetail && state.customer && state.customer.discountPerCupCents > 0" class="pill green">{{ tt('已应用会员权益', 'Member savings applied') }}</text>
                <view class="bill-line">
                  <text>{{ tt('商品金额', 'Subtotal') }}</text>
                  <text>{{ money(checkoutGross) }}</text>
                </view>
                <view v-if="checkoutCut" class="bill-line">
                  <text>{{ tt('大会员单杯权益', 'Member savings') }}</text>
                  <text>−{{ money(checkoutCut) }}</text>
                </view>
                <view v-if="checkoutCouponDiscount" class="bill-line">
                  <text>{{ checkoutCoupon ? checkoutCoupon.title : tt('优惠券', 'Coupon') }}</text>
                  <text>−{{ money(checkoutCouponDiscount) }}</text>
                </view>
                <view class="bill-line bill-total">
                  <text>{{ tt('合计', 'Total') }}</text>
                  <text class="amount">{{ money(checkoutTotal) }}</text>
                </view>
              </view>

              <view class="mini-card coupon-row-card">
                <view class="flex between">
                  <view class="grow">
                    <text class="card-title">{{ tt('优惠券', 'Coupon') }}</text>
                    <text class="tiny muted">
                      {{ checkoutCoupon ? checkoutCoupon.title : couponPickerHint }}
                    </text>
                  </view>
                  <button hover-class="none" class="text-btn" @click="openCouponPicker">
                    <text>{{ checkoutCoupon ? tt('更换', 'Change') : tt('选择', 'Choose') }}</text>
                    <AppIcon name="chevronRight" :size="14" />
                  </button>
                </view>
                <text v-if="checkoutCouponWarning" class="tiny muted section-space">{{ checkoutCouponWarning }}</text>
              </view>
            </template>
          </template>

          <!-- ------------------------------ 订单回执 ------------------------------ -->
          <template v-else-if="screen === 'receipt' || receiptFromOrders">
            <button
              v-if="receiptFromOrders"
              hover-class="none"
              class="float-back"
              :style="{ top: statusBarPx + 72 + 'px' }"
              :aria-label="tt('返回订单列表', 'Back to orders')"
              @click="closeReceipt"
            >
              <AppIcon name="chevronLeft" :size="20" />
            </button>
            <view v-if="!receiptOrder" class="empty">
              <text class="empty-title">{{ tt('还没有这笔订单', 'Order not found') }}</text>
              <text class="small">{{ tt('可先选茶体验下单。', 'Choose a tea to begin.') }}</text>
            </view>
            <view
              v-else
              class="receipt"
              @touchstart="onReceiptTouchStart"
              @touchend="onReceiptTouchEnd"
            >
              <view class="receipt-circle">
                <AppIcon :name="receiptIcon" :size="27" />
              </view>
              <text class="eyebrow">{{ receiptRetail ? 'A RITUAL TO TAKE HOME' : 'MADE FOR THIS MOMENT' }}</text>
              <text class="receipt-title">{{ receiptTitle }}</text>
              <text class="small muted">{{ receiptSub }}</text>
              <text class="order-number" :class="{ long: receiptRetail }">{{ receiptOrder.number }}</text>

              <view v-if="receiptRetail && receiptOrder.status !== 'refunded'" class="pickup-box">
                <text class="tiny muted">{{ tt('提货码 · 到店出示', 'Pickup code · Show in store') }}</text>
                <text class="pickup-code full">{{ receiptOrder.pickupCode || '—' }}</text>
                <view class="qr-wrap">
                  <QrImage :value="receiptOrder.pickupCode || receiptOrder.number" />
                </view>
                <text class="tiny muted">{{ tt('到店向伙伴出示此码，即可领取。', 'Show this code to a partner in store to collect.') }}</text>
              </view>

              <view v-if="!receiptRetail && receiptUnits.length" class="cup-progress">
                <view class="flex between">
                  <text class="cup-progress-title">{{ tt('逐杯进度', 'Cup progress') }}</text>
                  <text class="pill" :class="{ green: receiptScanned === receiptUnits.length }">{{ receiptScanned }}/{{ receiptUnits.length }}</text>
                </view>
                <view v-for="unit in receiptUnits" :key="unit.id" class="cup-row" :class="unit.status">
                  <text class="cup-no">{{ unit.label.slice(0, 2) }}</text>
                  <text class="grow">{{ unit.label }}</text>
                  <text v-if="unit.scannedAt || unit.status === 'ready'" class="pill green">{{ tt('已出餐', 'Ready') }}</text>
                  <text v-else class="pill">{{ tt('待制作', 'Pending') }}</text>
                </view>
              </view>

              <view v-if="receiptSteps.length" class="progress-card">
                <view class="flex between">
                  <text class="cup-progress-title">{{ receiptRetail ? tt('提货进度', 'Pickup progress') : tt('取茶进度', 'Tea progress') }}</text>
                  <text class="pill" :class="{ green: receiptProgressDone }">{{ receiptProgressLabel }}</text>
                </view>
                <view class="progress-list section-space">
                  <view
                    v-for="(step, index) in receiptSteps"
                    :key="step.key"
                    class="progress-item"
                    :class="step.state"
                  >
                    <view class="progress-rail">
                      <view class="progress-dot">
                        <AppIcon v-if="step.state === 'done'" name="check" :size="9" color="#fffefa" />
                      </view>
                      <view v-if="index < receiptSteps.length - 1" class="progress-line" />
                    </view>
                    <view class="progress-body">
                      <text class="progress-label">{{ step.label }}</text>
                      <text class="progress-hint">{{ step.hint }}</text>
                      <text v-if="step.time" class="progress-time">{{ step.time }}</text>
                    </view>
                  </view>
                </view>
              </view>

              <text class="small muted">{{ receiptHint }}</text>

              <view class="mini-card">
                <view v-for="item in receiptOrder.items" :key="item.id" class="bill-line">
                  <text>
                    {{ locale === 'en' ? item.nameEn || item.name : item.name }} ×{{ item.qty }}{{ item.refundedQty ? ` (${tt('已退', 'Refunded ')}${item.refundedQty})` : '' }}
                  </text>
                  <text>{{ [item.temp ? sp(item.temp) : '', item.ice ? sp(item.ice) : ''].filter(Boolean).join(' · ') }}</text>
                </view>
                <view v-if="receiptOrder.couponDiscountCents" class="bill-line">
                  <text>{{ receiptOrder.couponTitle || tt('优惠券', 'Coupon') }}</text>
                  <text>−{{ money(receiptOrder.couponDiscountCents) }}</text>
                </view>
                <view class="divider" />
                <view class="bill-line">
                  <text>{{ tt('净支付', 'Net payment') }}</text>
                  <text class="strong">{{ money(receiptOrder.totalCents - receiptOrder.refundedCents) }}</text>
                </view>
                <text class="tiny muted">{{ receiptPaid ? os(receiptOrder.status) : tt('待支付', 'To pay') }}</text>
                <button hover-class="none" class="text-btn" style="margin-top: 8px" @click="refreshReceipt">
                  <AppIcon name="refresh" :size="13" />
                  <text style="margin-left: 4px">{{ tt('刷新状态', 'Refresh status') }}</text>
                </button>
              </view>

              <button hover-class="none" v-if="receiptOrder.status === 'cancelled'" class="btn primary full" @click="reorder(receiptOrder)">
                {{ tt('再来一单', 'Order again') }}
              </button>
              <button
                hover-class="none"
                v-if="receiptFromOrders"
                :class="receiptOrder.status === 'cancelled' ? 'text-btn full' : 'btn primary full'"
                @click="closeReceipt"
              >{{ tt('返回我的订单', 'Back to my orders') }}</button>
              <button hover-class="none" v-else class="text-btn full" @click="go('orders')">{{ tt('我的订单', 'My orders') }}</button>
              <button hover-class="none" :class="receiptFromOrders || receiptOrder.status === 'cancelled' ? 'text-btn full' : 'btn primary full'" @click="go('home')">{{ tt('回到此刻', 'Back to now') }}</button>
            </view>
          </template>

          <!-- ------------------------------ 我的订单 ------------------------------ -->
          <template v-else-if="screen === 'orders'">
            <view class="page-heading">
              <text class="eyebrow">YOUR MOMENTS</text>
              <text class="heading-title">{{ tt('每一杯，都有回响。', 'Your moments, saved.') }}</text>
            </view>

            <view v-if="!state.customer" class="empty">
              <AppIcon name="user" :size="35" />
              <text class="empty-title">{{ tt('登录后查看订单', 'Sign in to see your orders') }}</text>
              <text class="small">{{ tt('手机号是会员身份，登录后鲜酿与零售订单都会记录在这里。', 'Your phone number is your membership. Fresh tea and retail orders will appear here once you sign in.') }}</text>
              <button hover-class="none" class="btn primary" @click="openLogin(() => loadOrders())">{{ isWeixin ? tt('手机号登录', 'Continue with phone') : tt('在小程序内登录', 'Sign in in the mini program') }}</button>
            </view>

            <template v-else>
              <!-- 订单按生命周期分三档；茶饮/零售属于订单属性，放在卡片上，不再和进行状态混作同级筛选。 -->
              <view class="order-tabs" role="tablist">
                <button hover-class="none"
                  v-for="tab in orderTabs"
                  :key="tab.key"
                  role="tab"
                  :aria-selected="ordersTab === tab.key"
                  :class="{ active: ordersTab === tab.key }"
                  @click="ordersTab = tab.key"
                >
                  <text>{{ tab.label }}</text>
                  <text v-if="tab.count" class="tab-count">{{ tab.count }}</text>
                </button>
              </view>

              <view v-if="ordersLoading" class="loading-block">
                <view class="spinner" />
                <text>{{ tt('正在读取订单', 'Loading orders') }}</text>
              </view>

              <!-- 读取失败（UI-09）：没有旧数据时明确报错并可重试，不再伪装成「还没有订单」。 -->
              <view v-if="!ordersLoading && ordersError && !orders.length" class="empty">
                <AppIcon name="refresh" :size="35" />
                <text class="empty-title">{{ tt('订单暂时读不到', 'Could not load your orders') }}</text>
                <text class="small">{{ ordersError }}</text>
                <button hover-class="none" class="btn" @click="loadOrders()">{{ tt('重试', 'Retry') }}</button>
              </view>

              <!-- 读取失败但有旧数据（UI-09）：保留旧列表并明确标注不是最新。 -->
              <view v-if="!ordersLoading && ordersError && orders.length" class="stale-banner">
                <text class="tiny">{{ tt('订单刷新失败，以下为上次结果。', 'Refresh failed. Showing your last loaded orders.') }}</text>
                <button hover-class="none" class="text-btn" @click="loadOrders()">{{ tt('重试', 'Retry') }}</button>
              </view>

              <view v-if="!ordersLoading && !ordersError && !filteredOrders.length" class="empty">
                <AppIcon name="receipt" :size="35" />
                <text class="empty-title">{{ ordersEmptyTitle }}</text>
                <text class="small">{{ ordersEmptyHint }}</text>
                <button v-if="!orders.length" hover-class="none" class="btn" @click="openMenu('all')">{{ tt('去茶单看看', 'Browse tea') }}</button>
                <button v-else-if="ordersTab === 'active' && orderCounts.completed" hover-class="none" class="btn" @click="ordersTab = 'completed'">{{ tt('查看已完成', 'See completed') }}</button>
                <button v-else-if="ordersTab !== 'active' && orderCounts.active" hover-class="none" class="btn" @click="ordersTab = 'active'">{{ tt('回到进行中', 'Back to active') }}</button>
              </view>

              <view v-for="order in filteredOrders" :key="order.id" class="mini-card order-card" :class="{ 'order-retail': isRetailOrder(order), 'order-closed': orderBucket(order) === 'closed' }">
                <view class="flex between order-card-head">
                  <view class="flex order-title-row">
                    <text class="order-card-no">{{ order.number }}</text>
                    <text class="order-type" :class="{ retail: isRetailOrder(order) }">{{ isRetailOrder(order) ? tt('零售', 'Retail') : tt('茶饮', 'Tea') }}</text>
                  </view>
                  <text class="pill" :class="orderStatusClass(order)">{{ orderStatusText(order) }}</text>
                </view>
                <text class="small muted order-meta">{{ orderMeta(order) }}</text>
                <text class="small section-space order-items-line">{{ itemsLine(order) }}</text>
                <view class="flex between">
                  <view>
                    <text class="order-total">{{ money(order.totalCents - order.refundedCents) }}</text>
                    <text v-if="order.couponDiscountCents" class="tiny muted coupon-order-note">
                      {{ tt(`已用券 −${money(order.couponDiscountCents)}`, `Coupon −${money(order.couponDiscountCents)}`) }}
                    </text>
                  </view>
                  <view class="order-card-actions">
                    <button v-if="order.status === 'cancelled'" hover-class="none" class="text-btn order-again" @click="reorder(order)">
                      {{ tt('再来一单', 'Order again') }}
                    </button>
                    <button hover-class="none" class="text-btn" @click="openReceipt(order)">
                      <text>{{ isRetailOrder(order) ? tt('查看提货码', 'Pickup code') : tt('查看取茶凭证', 'View receipt') }}</text>
                      <AppIcon name="chevronRight" :size="14" />
                    </button>
                  </view>
                </view>
              </view>
            </template>
          </template>

          <!-- ------------------------------ 我的 ------------------------------ -->
          <template v-else-if="screen === 'profile'">
            <view class="page-heading">
              <text class="eyebrow">A FULLER EVERYDAY</text>
              <text class="heading-title">{{ tt('我的日常', 'Your everyday.') }}</text>
              <text class="heading-sub">{{ tt('留点时间，给自己。', 'A little time for yourself.') }}</text>
            </view>

            <view v-if="!state.customer" class="mini-card login-card">
              <text class="eyebrow">FULL愈 MEMBERSHIP</text>
              <text class="card-title">{{ tt('登录后，查看你的会员权益', 'Sign in to see your member benefits') }}</text>
              <button hover-class="none" class="btn primary full section-space" @click="openLogin()">{{ isWeixin ? tt('手机号登录', 'Continue with phone') : tt('在小程序内登录', 'Sign in in the mini program') }}</button>
            </view>

            <!-- 未登录也保留品牌会员入口：先看清楚一张卡三店通用，再决定登录。 -->
            <button
              v-if="!state.customer"
              hover-class="none"
              class="brand-entry section-space"
              :aria-label="tt('了解 Full愈年卡', 'About the Full Yu annual card')"
              @click="openBrandMember"
            >
              <view class="brand-entry-head">
                <text class="brand-entry-eyebrow">FULL YU ANNUAL MEMBER</text>
                <text class="brand-entry-state">{{ tt('权益卡 · 三店通用', 'Benefit card') }}</text>
              </view>
              <text class="brand-entry-title serif">Full愈年卡</text>
              <text class="brand-entry-sub">
                {{ tt(`一张卡，时叙 / 在场 / 轻疗通用 · ¥${brandPriceText}/年`, `One card for Tea Hours, Presence and Retreat · ¥${brandPriceText}/year`) }}
              </text>
              <view class="brand-entry-foot">
                <text>{{ tt('了解会员权益', 'See member benefits') }}</text>
                <AppIcon name="chevronRight" :size="14" />
              </view>
            </button>

            <template v-else>
              <view class="mini-card profile-identity">
                <view class="profile-row">
                  <view class="profile-avatar">
                    <image
                      v-if="state.customer.avatarUrl"
                      class="profile-avatar-img"
                      :src="state.customer.avatarUrl"
                      mode="aspectFill"
                    />
                    <AppIcon v-else name="user" :size="28" color="#694b3d" />
                  </view>
                  <view class="grow">
                    <text class="profile-name">{{ state.customer.name }}</text>
                    <text class="profile-sub">{{ profileSub }}</text>
                  </view>
                  <button hover-class="none" class="icon-btn qr-shortcut" :aria-label="tt('打开会员码', 'Open member code')" @click="memberOpen = true">
                    <AppIcon name="qr" :size="19" />
                  </button>
                  <button hover-class="none" class="profile-edit-link" @click="openProfileEdit">
                    {{ tt('编辑', 'Edit') }}<AppIcon name="chevronRight" :size="15" />
                  </button>
                </view>
              </view>

              <!-- 品牌会员入口：一张卡三店通用；点卡进入身份页与愈行之旅。 -->
              <button
                hover-class="none"
                class="brand-entry"
                :class="{ 'is-active': brandActive }"
                :aria-label="tt('打开 Full愈年卡会员中心', 'Open Full Yu annual member center')"
                @click="openBrandMember"
              >
                <view class="brand-entry-head">
                  <text class="brand-entry-eyebrow">FULL YU ANNUAL MEMBER</text>
                  <text class="brand-entry-state">
                    {{ brandActive ? tt(`还有 ${brandRemaining} 天`, `${brandRemaining} days left`) : tt('权益卡 · 三店通用', 'Benefit card') }}
                  </text>
                </view>
                <text class="brand-entry-title serif">Full愈年卡</text>
                <text v-if="brandActive" class="brand-entry-sub">
                  {{ tt(`有效期至 ${brandValidUntil} · ${brandPoints} 积分 · ${brandDice} 颗骰子`, `Valid until ${brandValidUntil} · ${brandPoints} points · ${brandDice} dice`) }}
                </text>
                <text v-else-if="brandLoading" class="brand-entry-sub">{{ tt('正在读取会员状态…', 'Loading membership…') }}</text>
                <text v-else class="brand-entry-sub">
                  {{ tt(`一张卡，时叙 / 在场 / 轻疗通用 · ¥${brandPriceText}/年`, `One card for Tea Hours, Presence and Retreat · ¥${brandPriceText}/year`) }}
                </text>
                <view class="brand-entry-foot">
                  <text>{{ brandActive ? tt('进入会员中心', 'Member center') : tt('开通年卡', 'Join annual') }}</text>
                  <AppIcon name="chevronRight" :size="14" />
                </view>
              </button>

              <view class="profile-assets">
                <button hover-class="none" class="asset-item" @click="openAssets('coupons')">
                  <text class="asset-value">{{ couponAvailable }}</text>
                  <text class="asset-label">{{ tt('券', 'Coupons') }}</text>
                </button>
                <button hover-class="none" class="asset-item" @click="openAssets('points')">
                  <text class="asset-value">{{ state.customer.points || 0 }}</text>
                  <text class="asset-label">{{ tt('积分', 'Points') }}</text>
                </button>
                <button hover-class="none" class="asset-item" @click="goPickups">
                  <text class="asset-value">{{ pickups }}</text>
                  <text class="asset-label">{{ tt('待领取', 'To collect') }}</text>
                </button>
              </view>
            </template>

            <view class="mini-card menu-group">
              <template v-if="state.customer">
                <button hover-class="none" class="profile-menu" @click="navGo('orders')">
                  <AppIcon name="receipt" :size="19" />
                  <text class="grow">{{ tt('我的订单', 'My orders') }}</text>
                  <AppIcon name="chevronRight" :size="15" />
                </button>
              </template>
              <button hover-class="none" class="profile-menu" @click="openShare">
                <AppIcon name="share" :size="19" />
                <text class="grow">{{ tt('分享给朋友', 'Share with friends') }}</text>
                <AppIcon name="chevronRight" :size="15" />
              </button>
              <button hover-class="none" class="profile-menu" @click="toggleLocale">
                <AppIcon name="settings" :size="19" />
                <text class="grow">{{ tt('语言 / Language', 'Language / 语言') }}</text>
                <AppIcon name="chevronRight" :size="15" />
              </button>
              <button hover-class="none" class="profile-menu" @click="helpOpen = true">
                <AppIcon name="info" :size="19" />
                <text class="grow">{{ tt('联系与帮助', 'Help & contact') }}</text>
                <AppIcon name="chevronRight" :size="15" />
              </button>
              <button hover-class="none" class="profile-menu" @click="openLegal('privacy')">
                <AppIcon name="shield" :size="19" />
                <text class="grow">{{ tt('用户协议与隐私政策', 'Terms & privacy') }}</text>
                <AppIcon name="chevronRight" :size="15" />
              </button>
              <!-- 退出入口保留，但和普通菜单同一权重：不红色高亮，不主动引导退出。 -->
              <button hover-class="none" v-if="state.customer" class="profile-menu" @click="confirmLogout">
                <AppIcon name="logout" :size="19" color="#68625b" />
                <text class="grow">{{ tt('退出登录', 'Sign out') }}</text>
              </button>
            </view>
          </template>
        </template>
      </view>
    </scroll-view>

    <view v-if="showBag && state.store" class="bag-dock">
      <view class="bag-bar">
        <button hover-class="none" class="bag-open" :aria-label="tt('查看购物袋', 'View bag')" @click="bagOpen = true">
          <view class="bag-icon" :class="{ bump: bagBump }">
            <AppIcon :name="bagKind === 'retail' ? 'package' : 'bag'" :size="24" color="#fffefa" />
            <text class="count">{{ bagQty }}</text>
          </view>
          <view class="grow bag-summary">
            <text class="price">{{ money(bagTotal) }}</text>
            <view class="tiny">{{ bagSubtitle }}</view>
          </view>
        </button>
        <button hover-class="none" class="bag-checkout" @click="startCheckout(bagKind)">{{ tt('选好了', 'Checkout') }}</button>
      </view>
    </view>

    <!-- 结算页常驻支付栏：合计与支付入口不随长列表滚动。 -->
    <view v-if="screen === 'checkout' && !checkoutEmpty" class="pay-bar">
      <view class="pay-bar-total">
        <text class="tiny">{{ tt('合计', 'Total') }}</text>
        <text class="pay-bar-amount">{{ money(checkoutTotal) }}</text>
      </view>
      <button hover-class="none" class="pay-bar-btn" :disabled="paying" @click="onPay">
        {{ paying ? tt('正在支付…', 'Paying…') : tt('立即支付', 'Pay now') }}
      </button>
    </view>

    <view class="nav-bottom">
      <button hover-class="none"
        v-for="item in navItems"
        :key="item.key"
        :class="{ active: activeNav === item.key }"
        @click="navGo(item.key)"
      >
        <AppIcon :name="item.icon" :size="20" :color="activeNav === item.key ? '#694b3d' : '#68625b'" />
        <text>{{ item.label }}</text>
      </button>
    </view>

    <!-- ------------------------------ 购物袋 ------------------------------ -->
    <BottomSheet v-if="bagOpen" :title="tt('购物袋', 'Your bag')" @close="bagOpen = false">
      <template v-if="bagLines.length">
        <view v-for="line in bagLines" :key="line.key" class="checkout-item bag-line">
          <ProductArt :product="bagArt(line)" />
          <view class="grow">
            <text class="checkout-name">{{ bagName(line) }}</text>
            <text class="tiny muted">{{ bagMeta(line) }}</text>
            <text class="small checkout-amount">{{ money(bagLineTotal(line)) }}</text>
          </view>
          <view class="qty">
            <button hover-class="none" class="cart-qty" :aria-label="tt('减少', 'Decrease')" @click="decreaseQty(bagKind, line.key)">
              <AppIcon name="minus" :size="12" />
            </button>
            <text class="qty-num">{{ line.qty }}</text>
            <button hover-class="none" class="cart-qty" :aria-label="tt('增加', 'Increase')" @click="changeQty(bagKind, line.key, 1)">
              <AppIcon name="plus" :size="12" />
            </button>
          </view>
        </view>
      </template>
      <view v-else class="empty">
        <AppIcon name="bag" :size="30" />
        <text class="empty-title">{{ tt('购物袋空了', 'Your bag is empty') }}</text>
      </view>
      <view class="sheet-footer">
        <button hover-class="none" class="text-btn" @click="clearBag">{{ tt('清空', 'Clear') }}</button>
        <button hover-class="none" class="btn primary" :disabled="!bagLines.length" @click="checkoutFromBag">{{ tt('选好了', 'Checkout') }}</button>
      </view>
    </BottomSheet>

    <!-- ------------------------------ 门店 ------------------------------ -->
    <BottomSheet v-if="storeOpen" center :title="tt('选择取茶门店', 'Choose a tea store')" @close="closeStores">
      <view class="chips store-cities">
        <button hover-class="none" v-for="city in cities" :key="city" :class="{ active: city === storeCity }" @click="storeCity = city">{{ city }}</button>
      </view>
      <!-- 定位状态：首次打开门店列表时由用户主动触发系统授权，拒绝后仍可正常选店。 -->
      <view v-if="locationState !== 'granted'" class="store-locate">
        <text class="tiny muted store-locate-hint">{{ locationHint }}</text>
        <button v-if="locationAction" hover-class="none" class="text-btn store-locate-btn" @click="onLocationAction">
          {{ locationAction }}
        </button>
      </view>
      <view class="store-options">
        <button hover-class="none"
          v-for="item in cityStores"
          :key="item.id"
          class="store-option"
          :class="{ chosen: storeChosen && item.id === state.store.id, closed: !item.open }"
          :aria-pressed="storeChosen && item.id === state.store.id"
          :aria-disabled="!item.open"
          @click="pickStore(item)"
        >
          <view class="store-line">
            <text class="store-name">{{ sn(item) }}</text>
            <text v-if="!item.open" class="store-status">{{ tt('敬请期待', 'Stay tuned') }}</text>
            <text v-if="distanceText(item)" class="store-distance">{{ distanceText(item) }}</text>
            <view v-if="storeChosen && item.id === state.store.id" class="store-check">
              <AppIcon name="check" :size="12" color="#fffefa" />
            </view>
          </view>
          <text class="store-meta">{{ tt(item.address, item.addressEn) }} · {{ item.hours }}</text>
        </button>
      </view>
    </BottomSheet>

    <!-- ------------------------------ 个人资料 ------------------------------ -->
    <BottomSheet v-if="profileOpen && state.customer" :title="tt('个人资料', 'Your profile')" @close="closeProfileEdit">
      <view class="profile-edit-head">
        <button hover-class="none"
          v-if="isWeixin"
          class="avatar-picker"
          open-type="chooseAvatar"
          @chooseavatar="onChooseAvatar"
        >
          <view class="profile-avatar">
            <image
              v-if="state.customer.avatarUrl"
              class="profile-avatar-img"
              :src="state.customer.avatarUrl"
              mode="aspectFill"
            />
            <AppIcon v-else name="user" :size="28" color="#694b3d" />
          </view>
        </button>
        <!-- #ifndef MP-WEIXIN -->
        <button hover-class="none" v-else class="avatar-picker" @click="pickAvatarFromAlbum">
          <view class="profile-avatar">
            <image
              v-if="state.customer.avatarUrl"
              class="profile-avatar-img"
              :src="state.customer.avatarUrl"
              mode="aspectFill"
            />
            <AppIcon v-else name="user" :size="28" color="#694b3d" />
          </view>
        </button>
        <!-- #endif -->
        <text class="tiny muted">
          {{ avatarSaving ? tt('头像上传中…', 'Uploading…') : tt('点击头像更换', 'Tap the avatar to change it') }}
        </text>
      </view>

      <view class="form-row">
        <text class="form-label">{{ tt('姓名', 'Name') }}</text>
        <input
          v-if="isWeixin"
          type="nickname"
          :value="profileForm.name"
          :maxlength="12"
          :placeholder="tt('怎么称呼你', 'What should we call you')"
          @input="onProfileName"
          @change="onProfileName"
        />
        <input
          v-else
          :value="profileForm.name"
          :maxlength="12"
          :placeholder="tt('怎么称呼你', 'What should we call you')"
          @input="onProfileName"
        />
      </view>

      <text class="option-title">{{ tt('性别', 'Gender') }}</text>
      <view class="options">
        <button hover-class="none"
          v-for="item in genderOptions"
          :key="item.value"
          class="option"
          :class="{ selected: profileForm.gender === item.value }"
          @click="pickGender(item.value)"
        >
          {{ item.label }}
        </button>
      </view>

      <view class="form-row">
        <text class="form-label">{{ tt('生日', 'Birthday') }}</text>
        <picker mode="date" :value="profileForm.birthday || today" start="1900-01-01" :end="today" @change="onBirthday">
          <view class="form-select">
            <text>{{ profileForm.birthday || tt('选填', 'Optional') }}</text>
            <AppIcon name="chevronRight" :size="14" />
          </view>
        </picker>
      </view>

      <text v-if="profileError" class="note danger">{{ profileError }}</text>
      <view class="sheet-footer">
        <button hover-class="none" class="btn primary full" :disabled="profileSaving" @click="saveProfile">
          {{ profileSaving ? tt('正在保存…', 'Saving…') : tt('保存', 'Save') }}
        </button>
      </view>
      <text class="note section-space">{{ tt('生日与性别选填，仅用于会员关怀。', 'Birthday and gender are optional and used for member care.') }}</text>
    </BottomSheet>

    <!-- ------------------------------ 会员码 ------------------------------ -->
    <BottomSheet v-if="memberOpen && state.customer" center :title="tt('会员码', 'Member code')" @close="memberOpen = false">
      <view class="member-code-sheet">
        <text class="eyebrow">FULL愈 MEMBERSHIP</text>
        <view class="member-qr">
          <QrImage :value="state.customer.memberCode" class-name="member-qr-img" />
        </view>
        <text class="member-code">{{ state.customer.memberCode }}</text>
        <text class="tiny muted">{{ tt('向门店伙伴出示，核验后享受会员权益。', 'Show this to a partner to apply member benefits.') }}</text>
        <text class="pill" :class="{ green: member }">
          {{ member ? tt(`每杯减 ¥${(state.customer.discountPerCupCents / 100).toFixed(0)}`, `¥${(state.customer.discountPerCupCents / 100).toFixed(0)} off per cup`) : tt('普通会员', 'Member') }}
        </text>
        <button hover-class="none" class="btn primary full section-space" @click="memberOpen = false">{{ tt('收好', 'Done') }}</button>
      </view>
    </BottomSheet>

    <!-- ------------------------------ 登录 ------------------------------ -->
    <BottomSheet v-if="loginOpen" center :title="tt('会员登录', 'Member sign-in')" @close="closeLogin">
      <text v-if="!isWeixin" class="small muted">
        {{ tt('当前为网页预览，登录与下单请在小程序内完成。', 'This is a web preview. Please sign in and order in the mini program.') }}
      </text>
      <template v-if="isWeixin">
        <!-- 隐私协议必须由顾客主动勾选，不默认同意；未勾选时不会触发手机号授权。 -->
        <view class="login-consent">
          <button
            hover-class="none"
            class="consent-check"
            :class="{ checked: loginConsent }"
            :aria-checked="loginConsent"
            :aria-label="tt('同意用户协议与隐私政策', 'Agree to terms and privacy policy')"
            @click="toggleLoginConsent"
          >
            <AppIcon v-if="loginConsent" name="check" :size="11" color="#fffefa" />
          </button>
          <view class="consent-copy">
            <text>{{ tt('我已阅读并同意', 'I have read and agree to') }}</text>
            <button hover-class="none" class="link-btn" @click.stop="openLegal('terms')">{{ tt('《用户协议》', 'the Terms') }}</button>
            <text>·</text>
            <button hover-class="none" class="link-btn" @click.stop="openLegal('privacy')">{{ tt('《隐私政策》', 'the Privacy Policy') }}</button>
          </view>
        </view>
        <button hover-class="none"
          v-if="loginConsent"
          class="btn primary full section-space"
          open-type="getPhoneNumber"
          :disabled="loginSaving"
          @getphonenumber="onLoginPhone"
        >
          {{ loginSaving ? tt('正在登录…', 'Signing in…') : tt('手机号一键登录', 'Continue with phone number') }}
        </button>
        <button hover-class="none"
          v-else
          class="btn primary full section-space"
          :disabled="loginSaving"
          @click="requestLoginConsent"
        >
          {{ tt('手机号一键登录', 'Continue with phone number') }}
        </button>
      </template>
      <text v-else class="note section-space">
        {{ tt('打开「时叙」小程序，点击「手机号一键登录」即可。', 'Open the Teahour mini program and tap “Continue with phone number”.') }}
      </text>
      <text v-if="loginError" class="note danger section-space">{{ loginError }}</text>
    </BottomSheet>

    <!-- 未勾选协议时的二次确认：同意后勾选并直接拉起手机号授权，少一次返回操作。 -->
    <BottomSheet
      v-if="consentOpen"
      center
      :title="tt('登录前确认', 'Before you sign in')"
      @close="cancelLoginConsent"
    >
      <text class="consent-lead">
        {{ tt('登录将使用你的微信手机号创建会员身份。请确认已阅读并同意：', 'Signing in uses your WeChat phone number to create your membership. Please confirm you have read and agree to:') }}
      </text>
      <view class="consent-docs">
        <button hover-class="none" class="consent-doc" @click="openLegal('terms')">
          <text>{{ tt('《用户协议》', 'Terms of Service') }}</text>
          <AppIcon name="chevronRight" :size="13" />
        </button>
        <button hover-class="none" class="consent-doc" @click="openLegal('privacy')">
          <text>{{ tt('《隐私政策》', 'Privacy Policy') }}</text>
          <AppIcon name="chevronRight" :size="13" />
        </button>
      </view>
      <button hover-class="none"
        class="btn primary full section-space"
        open-type="getPhoneNumber"
        :disabled="loginSaving"
        @getphonenumber="onConsentPhone"
      >
        {{ loginSaving ? tt('正在登录…', 'Signing in…') : tt('同意并登录', 'Agree and sign in') }}
      </button>
      <button hover-class="none" class="btn soft full consent-cancel" @click="cancelLoginConsent">
        {{ tt('暂不', 'Not now') }}
      </button>
    </BottomSheet>

    <!-- ------------------------------ 我的权益 ------------------------------ -->
    <BottomSheet
      v-if="assetsOpen && state.customer"
      :title="couponPicker ? tt('选择优惠券', 'Choose a coupon') : tt('我的权益', 'My benefits')"
      @close="closeAssets"
    >
      <view class="asset-summary">
        <view class="asset-summary-item">
          <text class="asset-summary-value">{{ couponAvailable }}</text>
          <text class="tiny muted">{{ tt('张券可用', 'coupons available') }}</text>
        </view>
        <view class="asset-summary-item">
          <text class="asset-summary-value">{{ state.customer.points || 0 }}</text>
          <text class="tiny muted">{{ tt('积分 · 全平台共享', 'points · shared platform-wide') }}</text>
        </view>
      </view>

      <view v-if="couponsLoading" class="loading-block">
        <view class="spinner" />
        <text>{{ tt('正在读取权益', 'Loading benefits') }}</text>
      </view>
      <view v-else-if="couponsError" class="empty">
        <text class="small">{{ couponsError }}</text>
        <button hover-class="none" class="btn" @click="loadCoupons()">{{ tt('重试', 'Retry') }}</button>
      </view>
      <view v-else-if="!assetCoupons.length" class="empty">
        <AppIcon name="megaphone" :size="35" />
        <text class="empty-title">{{ couponPicker ? tt('暂时没有可用券', 'No coupons available') : tt('还没有优惠券', 'No coupons yet') }}</text>
        <text class="small">{{ tt('门店活动发放后，会出现在这里。', 'Coupons from store campaigns will appear here.') }}</text>
      </view>

      <view
        v-for="coupon in assetCoupons"
        :key="coupon.id"
        class="coupon-card"
        :class="{ disabled: coupon.status !== 'available' || (couponPicker && !couponFits(coupon).ok), picked: coupon.id === selectedCouponId }"
        @click="pickCoupon(coupon)"
      >
        <view class="coupon-amount">
          <text class="coupon-value">{{ money(coupon.amountCents) }}</text>
          <text class="tiny muted">
            {{ coupon.minSpendCents ? tt(`满 ${money(coupon.minSpendCents)} 可用`, `Min. ${money(coupon.minSpendCents)}`) : tt('无门槛', 'No minimum') }}
          </text>
        </view>
        <view class="grow">
          <text class="coupon-title">{{ coupon.title }}</text>
          <text class="tiny muted">{{ couponScopeText(coupon) }}</text>
          <text class="tiny muted">{{ tt(`有效期至 ${dayText(coupon.validTo)}`, `Valid until ${dayText(coupon.validTo)}`) }}</text>
          <text v-if="couponPicker && !couponFits(coupon).ok" class="tiny muted">{{ couponFits(coupon).reason }}</text>
        </view>
        <text class="pill" :class="{ green: coupon.status === 'available' }">{{ couponStatusText(coupon.status) }}</text>
      </view>

      <template v-if="couponPicker">
        <button hover-class="none" v-if="selectedCouponId" class="btn full section-space" @click="clearCoupon">{{ tt('不使用优惠券', 'Do not use a coupon') }}</button>
      </template>
      <template v-else-if="assetCoupons.length">
        <button hover-class="none" class="btn primary full section-space" @click="useCoupons">{{ tt('去选茶', 'Browse tea') }}</button>
      </template>
    </BottomSheet>

    <!-- ------------------------------ 商品 ------------------------------ -->
    <BottomSheet v-if="detail" center :title="detail.kind === 'retail' ? tt('零售商品', 'Retail item') : tt('选择这一杯', 'Choose your cup')" @close="detail = null">
      <view class="product-showcase" :class="showcaseTone">
        <ProductArt :product="detail" variant="showcase" />
      </view>
      <text class="sheet-product-name">{{ pn(detail) }}</text>
      <text class="small muted">{{ tt(detail.tag || detail.spec, detail.tagEn || detail.specEn || detail.nameEn || '') }}</text>
      <text v-if="detailDesc" class="product-desc">{{ detailDesc }}</text>

      <template v-if="detail.kind !== 'retail' && detail.temps && detail.temps.length">
        <text class="option-title">{{ tt('温度', 'Temperature') }}</text>
        <view class="options">
          <button hover-class="none" v-for="item in detail.temps" :key="item" class="option" :class="{ selected: detailTemp === item }" @click="detailTemp = item">
            {{ sp(item) }}
          </button>
        </view>
      </template>

      <template v-if="detail.kind !== 'retail' && detail.ice && detailTemp !== '热'">
        <text class="option-title">{{ tt('冰量', 'Ice') }}</text>
        <view class="options">
          <button hover-class="none" v-for="item in iceOptions" :key="item" class="option" :class="{ selected: detailIce === item }" @click="detailIce = item">
            {{ sp(item) }}
          </button>
        </view>
      </template>

      <view class="sheet-footer">
        <view class="qty">
          <button hover-class="none" class="cart-qty" :aria-label="tt('减少', 'Decrease')" @click="detailQty = Math.max(1, detailQty - 1)">
            <AppIcon name="minus" :size="12" />
          </button>
          <text class="qty-num">{{ detailQty }}</text>
          <button hover-class="none" class="cart-qty" :aria-label="tt('增加', 'Increase')" @click="detailQty = Math.min(20, detailQty + 1)">
            <AppIcon name="plus" :size="12" />
          </button>
        </view>
        <button hover-class="none" id="detail-add" class="btn primary" :disabled="detail.available === false" @click="addFromSheet">
          {{ detail.available === false ? tt('本店售罄', 'Sold out') : `${tt('加入购物袋', 'Add to bag')} · ${money(detail.priceCents * detailQty)}` }}
        </button>
      </view>
    </BottomSheet>

    <!-- ------------------------------ 支付前确认门店 ------------------------------ -->
    <BottomSheet v-if="confirmOpen && state.store" center :title="tt('确认门店', 'Confirm store')" @close="confirmOpen = false">
      <view class="mini-card pay-store-card">
        <text class="eyebrow">YOUR STORE</text>
        <text class="card-title">{{ sn(state.store) }}</text>
        <text class="small muted">
          {{ [tt(state.store.address, state.store.addressEn), confirmStoreFar ? '' : distanceText(state.store), state.store.hours].filter(Boolean).join(' · ') }}
        </text>
        <!-- 超过 1km 单独高亮：距离远时先让顾客确认门店，不藏在地址行里。 -->
        <view v-if="confirmStoreFar" class="pay-store-distance">
          <AppIcon name="pin" :size="14" />
          <text class="pay-store-distance-text">{{ tt(`距离你 ${confirmStoreDistance}`, `${confirmStoreDistance} away`) }}</text>
          <text class="pay-store-distance-tag">{{ tt('较远', 'Far') }}</text>
        </view>
        <view v-if="!checkoutRetail && state.dining === 'dine'" class="tiny section-space">
          {{ state.seat ? `${tt('送到', 'Deliver to')} ${sp(state.seat)}` : tt('到吧台取餐口取茶', 'Collect at the counter') }}
        </view>
      </view>
      <text v-if="payError" class="note danger">{{ payError }}</text>
      <view class="sheet-footer">
        <button hover-class="none" class="btn" @click="changeStoreFromConfirm">{{ tt('换一家门店', 'Change store') }}</button>
        <button hover-class="none" class="btn primary" :disabled="paying" @click="payNow">
          {{ paying ? tt('正在支付…', 'Paying…') : tt('门店正确，继续支付', 'Confirm and pay') }}
        </button>
      </view>
    </BottomSheet>

    <!-- ------------------------------ 帮助 ------------------------------ -->
    <BottomSheet v-if="helpOpen" center :title="tt('联系与帮助', 'Help & contact')" @close="helpOpen = false">
      <text class="small">{{ tt('如遇出杯、提货或退款问题，请到店联系伙伴。', 'For cup, pickup or refund questions, please ask a partner in store.') }}</text>
    </BottomSheet>

    <!-- ------------------------------ 分享给朋友 ------------------------------ -->
    <BottomSheet v-if="shareOpen" center :title="tt('分享给朋友', 'Share with friends')" @close="shareOpen = false">
      <view class="share-preview">
        <image class="share-brand-logo" :src="shareLogo" :style="shareLogoStyle" mode="aspectFit" />
        <text class="share-sub">时叙 · TEA HOUR</text>
        <text class="share-title">{{ tt('一杯茶，回到此刻。', 'A moment, all yours.') }}</text>
        <view class="share-code-card">
          <image
            v-if="shareCodeImage"
            class="share-code-img"
            :src="shareCodeImage"
            mode="aspectFit"
            show-menu-by-longpress
          />
          <view v-else class="share-code-empty" @click="shareCodeError && reloadShareCode()">
            <template v-if="shareCodeError">
              <text>{{ shareCodeError }}</text>
              <text class="share-code-retry">{{ tt('点按重试', 'Tap to retry') }}</text>
            </template>
            <text v-else>{{ tt('正在生成小程序码…', 'Preparing your code…') }}</text>
          </view>
        </view>
        <text class="share-hint">{{ tt('微信扫一扫 · 进入时叙', 'Scan with WeChat to open Tea Hour') }}</text>
      </view>

      <!-- #ifdef MP-WEIXIN -->
      <button hover-class="none" class="btn primary full section-space" open-type="share">
        {{ tt('发送给朋友', 'Send to friends') }}
      </button>
      <button
        hover-class="none"
        class="btn soft full"
        :disabled="!shareCodeImage || shareSaving"
        @click="saveSharePoster"
      >
        {{ shareSaving ? tt('正在保存…', 'Saving…') : tt('保存海报到相册', 'Save poster to album') }}
      </button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <button hover-class="none" class="btn primary full section-space" @click="copyShareLink">
        {{ tt('复制访问链接', 'Copy link') }}
      </button>
      <text class="tiny muted share-note">
        {{ tt('在微信小程序内可直接发送给朋友并保存海报。', 'Open the mini program in WeChat to send cards and save posters.') }}
      </text>
      <!-- #endif -->

      <text class="tiny muted share-note">
        {{ tt('海报含小程序码，好友扫码即可进入时叙首页。', 'The poster includes a mini program code that opens the Tea Hour home page.') }}
      </text>
    </BottomSheet>

    <!-- 海报画布放在页面根节点：放进弹层组件内部时，部分机型查询不到 canvas 节点。 -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas type="2d" id="share-poster" class="share-canvas" />
    <!-- #endif -->

    <view v-if="toastText" class="toast" :class="`toast-${toastTone}`" :style="{ top: statusBarPx + 10 + 'px' }">
      <AppIcon :name="toastTone === 'ok' ? 'check' : toastTone === 'info' ? 'info' : 'alert'" :size="16" color="#fdfaf4" />
      <text class="toast-text">{{ toastText }}</text>
    </view>

    <!-- 加购飞入购物袋的杯子：纯视觉层，不接收点击，动画结束即移除。 -->
    <view v-if="flyVisible && flyProduct" class="fly-cup" :style="flyStyle" aria-hidden="true">
      <ProductArt :product="flyProduct" />
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app';
import { api } from '@/api';
import {
  state,
  init,
  setCustomer,
  logout,
  chooseStore,
  applyTable,
  setDining,
  addFresh,
  addRetail,
  changeQty,
  clearCart,
  submitOrder,
  refreshCatalog,
  freshCount,
  retailCount,
  freshGross,
  memberCut,
  retailGross
} from '@/store';
import { SERIES, money } from '@/lib/catalog';
import {
  t as tr,
  pname as pnameOf,
  sname as snameOf,
  spec as specOf,
  ostatus as ostatusOf,
  orderLabel
} from '@/lib/locale';
import { productTone } from '@/lib/svg';
import {
  IS_WEIXIN_MP,
  login as wxLogin,
  requestPayment,
  scanCode,
  phonePayload,
  phoneAuthFailure,
  chooseImageFile,
  readFileAsBase64
} from '@/lib/wechat';
import { parseTableCode } from '@/lib/tableCode';
import { isSameVisitDay } from '@/lib/visitDay';
import { bucketOrders, orderBucket, orderBucketCounts } from '@/lib/orderBuckets';
import { lastSpecFor, needsSpecChoice, productQtyInCart } from '@/lib/cartLines';
import { isPickupOrder, isReadyPickup, pickupOrders, pickupTarget, readyFirst } from '@/lib/pickupOrders';
import { distanceKm, formatDistance } from '@/lib/geo';
import { POSTER_HEIGHT, POSTER_WIDTH, drawSharePoster, logoSrcCandidates } from '@/lib/sharePoster';
import {
  CARD_PRODUCTS as BRAND_CARD_PRODUCTS,
  claimGiftCode,
  formatDate as formatBrandDate,
  loadBrandMember,
  peekPendingGift,
  takePendingGift
} from '@/lib/brandMember';
import AppIcon from '@/components/AppIcon.vue';
import ProductArt from '@/components/ProductArt.vue';
import SeriesMotif from '@/components/SeriesMotif.vue';
import QrImage from '@/components/QrImage.vue';
import BottomSheet from '@/components/BottomSheet.vue';

const LOCALE_KEY = 'teahour.customer.locale';
const seriesKeys = ['xing', 'song', 'qing', 'mian'];
const tempOptions = ['全部', '热', '冰'];
const iceOptions = ['标准冰', '少冰', '去冰'];

const locale = ref('zh');
/** 后台配置的首页轮播；为空时首页显示默认品牌主视觉。 */
const homeBanners = computed(() => (state.home && state.home.banners) || []);
/** 首页系列卡使用后台覆盖图，未上传时回落到设计好的中英文成品图。 */
function seriesArt(key) {
  const slot = `${key}-${locale.value === 'en' ? 'en' : 'zh'}`;
  const override = state.home && state.home.series ? state.home.series[slot] : '';
  return override || `/static/series/${slot}.webp`;
}
// 自定义导航栏：小程序页面从屏幕顶部开始绘制，必须自己让出状态栏高度。
// CSS 变量 --status-bar-height 在微信真机不可靠，统一用 JS 读取后以内联样式写入。
// H5 默认 0，不额外增加顶部留白。
const statusBarPx = ref(0);
// 语言切换贴在胶囊正下方；品牌行从同一位置开始，高度与按钮一致，中线自然对齐。
// H5 没有胶囊，给一组稳定的回退值。
const langStyle = ref({ top: '14px', right: '18px' });
const langTopPx = ref(14);
const headerStyle = computed(() => ({ paddingTop: `${langTopPx.value}px` }));
// #ifdef MP-WEIXIN
try {
  const capsule = uni.getMenuButtonBoundingClientRect();
  const system = uni.getSystemInfoSync();
  statusBarPx.value = (system && system.statusBarHeight) || 20;
  if (capsule && capsule.left && system.windowWidth) {
    const right = Math.max(12, system.windowWidth - capsule.right);
    // 胶囊底边往下 6px 放切换按钮；头部高度要把它完整包住，避免压到门店栏。
    const top = Math.max(10, capsule.bottom - statusBarPx.value + 6);
    langTopPx.value = top;
    langStyle.value = { top: `${top}px`, right: `${right}px` };
  }
} catch (error) {
  statusBarPx.value = 20;
}
// #endif
try {
  const stored = uni.getStorageSync(LOCALE_KEY);
  if (stored === 'en' || stored === 'zh') locale.value = stored;
} catch (error) {
  locale.value = 'zh';
}

const tt = (zh, en) => tr(locale.value, zh, en);
const pn = (product) => pnameOf(locale.value, product);
const sn = (store) => snameOf(locale.value, store);
const sp = (value) => specOf(locale.value, value);
const os = (status) => ostatusOf(locale.value, status);

/** 商品详情描述：按当前语言取后台维护的中/英文描述，当前语言为空则整行隐藏（UI-04）。 */
const detailDesc = computed(() => {
  const product = detail.value;
  if (!product) return '';
  return String((locale.value === 'en' ? product.descEn : product.desc) || '').trim();
});

const screen = ref('home');
const scrollTop = ref(0);
const menuSeries = ref('all');
const menuTemp = ref('全部');
const menuQuery = ref('');
const retailCategory = ref('all');
const checkoutKind = ref('fresh');
const receiptOrder = ref(null);
// 从订单列表查看提货码：回执作为「订单」内的子页面，底部导航与筛选保持不动，关闭即回到列表。
const receiptFromOrders = ref(false);
const orders = ref([]);
// 订单列表三态分离（UI-09）：加载中 / 失败（区分有无旧数据）/ 真实空单，不再把失败当空。
const ordersLoading = ref(false);
const ordersError = ref('');
const ordersTab = ref('active');

const storeOpen = ref(false);
const storeCity = ref('');
// 顾客定位只用于「距离」展示与选店排序；未授权时保持门店原有顺序，不显示假距离。
const userPos = ref(null);
// idle 未询问 / requesting 请求中 / granted 已授权 / denied 用户拒绝 / system 手机定位关闭 / failed 获取失败。
const locationState = ref('idle');
let locationPending = null;
// 购物袋弹层：点开袋详情后可直接增减数量；扫码不再需要中间弹层。
const bagOpen = ref(false);
// 微信小程序内才渲染扫码/手机号授权入口；H5 预览只浏览，登录与下单在小程序内完成。
const isWeixin = IS_WEIXIN_MP;
const loginOpen = ref(false);
const loginError = ref('');
const loginSaving = ref(false);
// 登录前隐私协议：必须由顾客主动勾选，关闭弹层后重置，不默认同意。
const loginConsent = ref(false);
// 未勾选时点击登录：先弹出品牌内的确认层，同意后同一次手势完成授权与登录。
const consentOpen = ref(false);
let pendingAfterLogin = null;
/** 扫码带会员码时只自动弹一次登录层，避免顾客关闭后反复打断。 */
let giftLoginPrompted = false;
// 从支付确认弹层跳去换店时，选完店后自动回到确认弹层。
const reopenConfirmAfterStore = ref(false);
const coupons = ref([]);
const couponsLoading = ref(false);
const couponsError = ref('');
const assetsOpen = ref(false);
const couponPicker = ref(false);
const selectedCouponId = ref('');
// 自动选券开关：进入结算自动挑最优惠的一张；顾客手动清空后本单不再自动加回。
const couponAuto = ref(true);
const memberOpen = ref(false);
const profileOpen = ref(false);
const profileForm = reactive({ name: '', gender: null, birthday: '' });
const profileSaving = ref(false);
const avatarSaving = ref(false);
const profileError = ref('');
const helpOpen = ref(false);
// 分享给朋友：卡片转发走微信原生能力；海报用服务端小程序码在本机合成后存相册。
const shareOpen = ref(false);
const shareCodeImage = ref('');
const shareCodeError = ref('');
const shareSaving = ref(false);
// 分享弹层顶部与海报顶部都用品牌 LOGO，不再用文字拼品牌名；英文用英文字标。
const shareLogo = computed(() => (locale.value === 'en' ? '/static/logo-en.png' : '/static/logo-zh.png'));
const shareLogoStyle = computed(() =>
  locale.value === 'en' ? 'width:93px;height:48px' : 'width:160px;height:29.6px'
);
const instance = getCurrentInstance();
let shareCodePending = null;
const confirmOpen = ref(false);
const detail = ref(null);
const detailTemp = ref('热');
const detailIce = ref('热饮');
const detailQty = ref(1);

const paying = ref(false);
const payError = ref('');
const toastText = ref('');
const toastTone = ref('ok');
// 加购反馈：飞入购物袋的杯子、袋图标弹动与商品按钮回弹。
// 这几个状态都只影响视觉，不参与购物袋数据；购物袋仍由 store 统一维护。
const bagBump = ref(false);
const recentAddId = ref('');
const flyVisible = ref(false);
const flyProduct = ref(null);
const flyStyle = ref('');
let bumpTimer = null;
let recentTimer = null;
let flyTimer = null;
let toastTimer = null;

// 未登录也可以浏览茶单与选店；下单、订单与权益再引导手机号登录。
const ready = computed(() => Boolean(state.store) && !state.loading);
const storeChosen = computed(() => Boolean(state.storeChosen));
const bottle = computed(() => state.products.find((product) => product.kind === 'bottle' && product.status === 'published'));
const member = computed(() => Boolean(state.customer && state.customer.discountPerCupCents > 0));
// 立减金额只来自服务端会员资料；未登录或服务端未返回时按 0 处理，不在前端编造优惠。
const memberPerCup = computed(() => (state.customer && state.customer.discountPerCupCents) || 0);

/** 个人资料副标题：手机号脱敏 + 会员身份；会员码只在旁边的小图标里展示。 */
const profileSub = computed(() => {
  if (!state.customer) return '';
  const phone = String(state.customer.phone || '');
  const masked = phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
  return member.value
    ? tt(`大会员 · ${masked}`, `Member · ${masked}`)
    : tt(`会员 · ${masked}`, `Member · ${masked}`);
});

/**
 * 品牌会员（Full愈年卡）入口。
 * 页面只消费 CRM 适配层返回的状态；加载失败保持空态，不把失败显示成「未开通」。
 */
const brandMember = ref(null);
const brandLoading = ref(false);
const brandAnnualPrice = ref(
  (BRAND_CARD_PRODUCTS.find((item) => item.code === 'FY_ANNUAL') || {}).priceCents || 29900
);
const brandState = computed(
  () => (brandMember.value && brandMember.value.card && brandMember.value.card.state) || 'NONE'
);
const brandActive = computed(() => ['ACTIVE', 'EXPIRING', 'PENDING'].includes(brandState.value));
const brandRemaining = computed(() => (brandMember.value && brandMember.value.card && brandMember.value.card.remainingDays) || 0);
const brandValidUntil = computed(() => formatBrandDate(brandMember.value && brandMember.value.card && brandMember.value.card.validUntil));
const brandPoints = computed(() => (brandMember.value && brandMember.value.points && brandMember.value.points.balance) || 0);
const brandDice = computed(() => (brandMember.value && brandMember.value.dice && brandMember.value.dice.balance) || 0);
const brandPending = computed(() => (brandMember.value && brandMember.value.prizes && brandMember.value.prizes.pending) || 0);
const brandPriceText = computed(() => String(Math.round(brandAnnualPrice.value / 100)));

async function loadBrand() {
  if (!state.customer) {
    brandMember.value = null;
    return;
  }
  brandLoading.value = true;
  try {
    brandMember.value = await loadBrandMember();
  } catch (error) {
    brandMember.value = null;
  } finally {
    brandLoading.value = false;
  }
}

function openBrandMember() {
  // 未登录先走登录，否则会员页只会拿到「请先登录」的错误态，看起来像功能坏了。
  if (!state.customer) {
    openLogin();
    return;
  }
  uni.navigateTo({ url: '/pages/brand-member/index' });
}

const genderOptions = computed(() => [
  { value: 1, label: tt('男', 'Male') },
  { value: 2, label: tt('女', 'Female') }
]);

/** 生日选择上限为今天，避免选到未来日期。 */
const today = computed(() => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
});

const navItems = computed(() => [
  { key: 'home', icon: 'home', label: tt('此刻', 'Now') },
  { key: 'menu', icon: 'cup', label: tt('茶单', 'Tea') },
  { key: 'retail', icon: 'package', label: tt('带回家', 'Take home') },
  { key: 'orders', icon: 'receipt', label: tt('订单', 'Orders') },
  { key: 'profile', icon: 'user', label: tt('我的', 'Me') }
]);

/** 零售回执归到「带回家」；鲜酿回执归到「订单」，让底部标签与内容对应。 */
const activeNav = computed(() => {
  if (screen.value === 'receipt') return receiptRetail.value ? 'retail' : 'orders';
  if (screen.value === 'checkout') return checkoutRetail.value ? 'retail' : 'menu';
  return screen.value;
});

const teas = computed(() => state.products.filter((product) => product.kind !== 'retail' && product.status === 'published'));
const menuList = computed(() => {
  let list = teas.value.filter((product) => menuSeries.value === 'all' || product.series === menuSeries.value);
  if (menuTemp.value !== '全部') list = list.filter((product) => (product.temps || []).includes(menuTemp.value));
  if (menuQuery.value) {
    const needle = menuQuery.value.toLowerCase();
    list = list.filter((product) =>
      `${product.name}${product.nameEn || ''}${product.tag || ''}${product.tagEn || ''}`.toLowerCase().includes(needle)
    );
  }
  return list;
});
/** 茶单二级标题直接取后台分类（鲜酿茶 / 康普茶 / 气泡茶），顺序按分类列表。 */
const categoryIndex = computed(() => new Map(state.categories.map((item, index) => [item.id, { ...item, index }])));
function categoryOrder(id) {
  const matched = categoryIndex.value.get(id);
  return matched ? matched.index : 9999;
}
function categoryTitle(id, english = false) {
  const matched = categoryIndex.value.get(id);
  if (!matched) return english ? 'Other' : '其他';
  return english ? (matched.nameEn || matched.name) : matched.name;
}
function groupByCategory(items) {
  const blocks = new Map();
  for (const product of items) {
    const key = product.categoryId || 'other';
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(product);
  }
  return [...blocks.entries()]
    .sort((a, b) => categoryOrder(a[0]) - categoryOrder(b[0]))
    .map(([key, groupItems]) => ({
      key,
      items: groupItems,
      title: categoryTitle(key),
      titleEn: categoryTitle(key, true)
    }));
}
/** 「全部」按系列分组，系列内再按分类分组；单系列直接展示该系列全部茶饮。 */
const menuGroups = computed(() => {
  if (menuSeries.value !== 'all') {
    return menuList.value.length ? [{ key: menuSeries.value, groups: groupByCategory(menuList.value) }] : [];
  }
  return seriesKeys
    .map((key) => ({ key, items: menuList.value.filter((product) => product.series === key) }))
    .filter((group) => group.items.length)
    .map((group) => ({ key: group.key, groups: groupByCategory(group.items) }));
});

const retailCats = computed(() => state.categories.filter((item) => item.kind === 'retail'));
const categoryOf = (id) => {
  const matched = state.products.find((product) => product.id === id);
  return matched ? matched.categoryId : undefined;
};
const retailList = computed(() =>
  state.retail.filter((item) => retailCategory.value === 'all' || categoryOf(item.id) === retailCategory.value)
);
const retailFeature = computed(() => state.products.find((product) => product.kind === 'retail' && product.status === 'published'));

const bagKind = computed(() => (screen.value === 'retail' ? 'retail' : 'fresh'));
const bagQty = computed(() => (bagKind.value === 'retail' ? retailCount() : freshCount()));
const bagTotal = computed(() =>
  bagKind.value === 'retail' ? retailGross() : Math.max(0, freshGross() - memberCut())
);
const showBag = computed(
  () => bagQty.value > 0 && !['checkout', 'receipt', 'orders', 'profile'].includes(screen.value)
);
// 袋栏不展示品类或门店：一袋可能同时有鲜酿、康普茶和香槟，且香槟也能堂食。
// 只报一个总数，具体是什么点开可看。
const bagSubtitle = computed(() =>
  bagKind.value === 'retail'
    ? tt(`共 ${bagQty.value} 件`, `${bagQty.value} ${bagQty.value === 1 ? 'item' : 'items'}`)
    : tt(`共 ${bagQty.value} 杯`, `${bagQty.value} ${bagQty.value === 1 ? 'cup' : 'cups'}`)
);
/** 购物袋弹层复用现有袋数据，鲜酿与零售各看各的，避免串单。 */
const bagRetail = computed(() => bagKind.value === 'retail');
const bagLines = computed(() => (bagRetail.value ? state.retailCart : state.freshCart));
function bagArt(line) {
  return bagRetail.value ? retailArt(line) : line.product;
}
function bagName(line) {
  return bagRetail.value ? line.item.name : pn(line.product);
}
function bagMeta(line) {
  if (bagRetail.value) return tt('零售装 · 任意门店领取', 'Retail pack · Any-store pickup');
  return [line.temp, line.temp === '热' ? '' : line.ice].filter(Boolean).map(sp).join(' · ');
}
function bagLineTotal(line) {
  return bagRetail.value ? line.item.priceCents * line.qty : line.product.priceCents * line.qty;
}

const checkoutRetail = computed(() => checkoutKind.value === 'retail');
const checkoutEmpty = computed(() =>
  checkoutRetail.value ? !state.retailCart.length : !state.freshCart.length
);
const checkoutGross = computed(() =>
  checkoutRetail.value ? retailGross() : freshGross()
);
const checkoutCut = computed(() => (checkoutRetail.value ? 0 : memberCut()));

/** 结算行与券适用范围：券只作用于可用商品的实付小计，口径与服务端核验一致。 */
const checkoutLines = computed(() => {
  if (checkoutRetail.value) {
    return state.retailCart.map((line) => ({
      categoryId: line.categoryId || categoryOf(line.item.id),
      totalCents: line.item.priceCents * line.qty
    }));
  }
  const perCup = (state.customer && state.customer.discountPerCupCents) || 0;
  return state.freshCart.map((line) => ({
    categoryId: line.product.categoryId,
    totalCents:
      line.product.priceCents * line.qty -
      (line.product.memberEligible ? perCup * line.qty : 0)
  }));
});

function couponEligibleCents(coupon) {
  if (!coupon) return 0;
  return checkoutLines.value
    .filter((line) => coupon.scope === 'all' || line.categoryId === coupon.categoryId)
    .reduce((sum, line) => sum + line.totalCents, 0);
}

function couponFits(coupon) {
  if (!coupon) return { ok: false, reason: '' };
  if (coupon.status !== 'available') return { ok: false, reason: couponStatusText(coupon.status) };
  const eligible = couponEligibleCents(coupon);
  if (!eligible) return { ok: false, reason: tt('本单没有适用商品', 'No eligible items in this order') };
  if (eligible < coupon.minSpendCents) {
    return {
      ok: false,
      reason: tt(`还差 ${money(coupon.minSpendCents - eligible)} 可用`, `${money(coupon.minSpendCents - eligible)} more to use`)
    };
  }
  return { ok: true, reason: '' };
}

const selectedCoupon = computed(() => coupons.value.find((coupon) => coupon.id === selectedCouponId.value) || null);
const checkoutCoupon = computed(() => {
  const coupon = selectedCoupon.value;
  if (!coupon || coupon.status !== 'available') return null;
  return couponFits(coupon).ok ? coupon : null;
});
const checkoutCouponDiscount = computed(() =>
  checkoutCoupon.value ? Math.min(checkoutCoupon.value.amountCents, couponEligibleCents(checkoutCoupon.value)) : 0
);
const checkoutCouponWarning = computed(() => {
  const coupon = selectedCoupon.value;
  if (!coupon) return '';
  const fit = couponFits(coupon);
  return fit.ok ? '' : fit.reason;
});
const couponAvailable = computed(() => coupons.value.filter((coupon) => coupon.status === 'available').length);
const couponPickerHint = computed(() =>
  couponAvailable.value
    ? tt(`有 ${couponAvailable.value} 张券可用`, `${couponAvailable.value} coupons available`)
    : tt('暂无可用券', 'No coupons available')
);
const assetCoupons = computed(() =>
  couponPicker.value ? coupons.value.filter((coupon) => coupon.status === 'available') : coupons.value
);
const checkoutTotal = computed(() =>
  Math.max(0, checkoutGross.value - checkoutCut.value - checkoutCouponDiscount.value)
);

/** 自动选券：在「可用且满足门槛」的券里挑本单抵扣最大的一张。 */
function autoPickCoupon() {
  if (!couponAuto.value) return;
  const best = coupons.value
    .filter((coupon) => coupon.status === 'available')
    .map((coupon) => ({
      coupon,
      fit: couponFits(coupon),
      discount: Math.min(coupon.amountCents, couponEligibleCents(coupon))
    }))
    .filter((entry) => entry.fit.ok && entry.discount > 0)
    .sort((a, b) => b.discount - a.discount)[0];
  selectedCouponId.value = best ? best.coupon.id : '';
}

// 结算页改动数量后券可能不再满足门槛：自动模式重新挑一张；手动选择/清空后保持不动。
watch(
  checkoutLines,
  () => {
    if (screen.value === 'checkout' && couponAuto.value) autoPickCoupon();
  },
  { deep: true }
);

const receiptRetail = computed(() => Boolean(receiptOrder.value && receiptOrder.value.business === 'retail'));
const receiptReady = computed(() => {
  const status = receiptOrder.value && receiptOrder.value.status;
  return status === 'ready' || status === 'delivered';
});
const receiptUnits = computed(() =>
  ((receiptOrder.value && receiptOrder.value.units) || []).filter((unit) => unit.status !== 'refunded')
);
const receiptScanned = computed(() =>
  receiptUnits.value.filter((unit) => unit.scannedAt || unit.status === 'ready').length
);
const receiptIcon = computed(() => {
  if (!receiptOrder.value) return 'cup';
  if (receiptOrder.value.status === 'refunded' || receiptOrder.value.status === 'cancelled') return 'refresh';
  if (receiptRetail.value) return receiptOrder.value.status === 'delivered' ? 'check' : 'package';
  return receiptOrder.value.status === 'ready' ? 'check' : 'cup';
});
// UI-01：支付状态以服务端 paymentStatus 为准；回调未到时不得显示“已支付”。
const receiptPaid = computed(() => Boolean(receiptOrder.value && receiptOrder.value.paymentStatus === 'paid'));
const receiptTitle = computed(() => {
  const order = receiptOrder.value;
  if (!order) return '';
  if (order.status === 'refunded') return tt('本单已退款', 'This order is refunded');
  if (order.status === 'cancelled') {
    return tt('支付未完成，本单已取消。', 'Payment was not completed. This order is cancelled.');
  }
  if (order.paymentStatus !== 'paid') return tt('待支付，完成付款后开始制作。', 'Awaiting payment. We start once it goes through.');
  if (receiptRetail.value) {
    return order.status === 'delivered'
      ? tt('已交付，愿茶香常伴。', 'Collected. Enjoy your tea.')
      : tt('喜欢的茶，等你带回家。', 'Your tea is waiting for you.');
  }
  return order.status === 'ready' || order.status === 'delivered'
    ? tt('你的茶已出餐，请到取餐口取茶。', 'Your tea is ready. Please collect it at the counter.')
    : tt('茶正在准备，请稍坐。', 'Your tea is being prepared.');
});
const receiptSub = computed(() => {
  const order = receiptOrder.value;
  if (!order) return '';
  if (receiptRetail.value) {
    if (order.status === 'delivered') {
      const pickup = state.stores.find((item) => item.id === order.pickupStoreId) || state.stores[0];
      return sn(pickup);
    }
    return tt('任意门店领取', 'Pickup at any store');
  }
  const store = state.stores.find((item) => item.id === order.storeId) || state.stores[0];
  return `${sn(store)} · ${orderLabel(locale.value, order)}`;
});
const receiptHint = computed(() => {
  const order = receiptOrder.value;
  if (!order) return '';
  if (order.status === 'cancelled') {
    return tt('本单未扣款，库存与优惠券已释放；需要的话可以重新点单。', 'Nothing was charged. Stock and coupons were released; you can order again.');
  }
  if (receiptRetail.value && order.status === 'delivered') {
    return tt('本次提货码已在门店使用。', 'This pickup code has been used in store.');
  }
  return '';
});

/** 时间线只显示时:分，日期由订单号与列表位置承担；无时间时整行隐藏。 */
const formatClock = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * 取茶/提货进度：每一项都写清「现在到哪一步、接下来做什么」。
 * done = 已完成；active = 当前进行中；todo = 尚未开始。
 */
const receiptSteps = computed(() => {
  const order = receiptOrder.value;
  if (!order) return [];
  const paid = order.paymentStatus === 'paid';
  const status = order.status;
  const step = (key, label, hint, state, time) => ({ key, label, hint, state, time: time || '' });

  if (receiptRetail.value) {
    const collected = status === 'delivered';
    return [
      step('paid', tt('已支付', 'Paid'), tt('订单已收到', 'Order received'), paid ? 'done' : 'todo', formatClock(order.paidAt)),
      step(
        'collect',
        tt('待提货', 'Ready to collect'),
        tt('到店出示提货码领取', 'Show your pickup code in store'),
        collected ? 'done' : paid ? 'active' : 'todo'
      ),
      step(
        'collected',
        tt('已交付', 'Collected'),
        tt('提货码已在门店使用', 'Pickup code used in store'),
        collected ? 'done' : 'todo',
        formatClock(order.deliveredAt)
      )
    ];
  }

  const brewing = status === 'pending';
  const ready = status === 'ready' || status === 'delivered';
  // 顾客侧把「已出餐」视为最终状态：做好即完成，到取餐口出示订单号取走即可，不再要求扫码。
  return [
    step('paid', tt('已支付', 'Paid'), tt('订单已收到', 'Order received'), paid ? 'done' : 'todo', formatClock(order.paidAt)),
    step(
      'brewing',
      tt('制作中', 'Brewing'),
      tt('茶正在为你现做', 'We are brewing your tea'),
      ready ? 'done' : paid && brewing ? 'active' : 'todo'
    ),
    step(
      'ready',
      tt('已出餐', 'Ready'),
      ready ? tt('到取餐口出示订单号取茶即可', 'Show your order number at the pickup counter') : tt('全部杯贴完成后即可取茶', 'Collect once every cup is ready'),
      ready ? 'done' : 'todo',
      formatClock(order.preparedAt)
    )
  ];
});

const receiptProgressDone = computed(() =>
  Boolean(receiptOrder.value && (receiptOrder.value.status === 'ready' || receiptOrder.value.status === 'delivered'))
);
const receiptProgressLabel = computed(() => {
  const order = receiptOrder.value;
  if (!order) return '';
  if (order.status === 'refunded') return tt('已退款', 'Refunded');
  if (order.paymentStatus !== 'paid') return tt('待支付', 'To pay');
  if (receiptRetail.value) return order.status === 'delivered' ? tt('已交付', 'Collected') : tt('待提货', 'To collect');
  return order.status === 'ready' || order.status === 'delivered' ? tt('已出餐', 'Ready') : tt('制作中', 'Brewing');
});

const orderCounts = computed(() => orderBucketCounts(orders.value));
const orderTabs = computed(() => [
  { key: 'active', label: tt('进行中', 'Active'), count: orderCounts.value.active },
  { key: 'completed', label: tt('已完成', 'Completed'), count: orderCounts.value.completed },
  { key: 'closed', label: tt('已取消', 'Closed'), count: orderCounts.value.closed }
]);
const filteredOrders = computed(() => {
  const list = bucketOrders(orders.value, ordersTab.value);
  // 进行中里把已出餐/待提货排前面，从首页「N 单可取」进来时不用再翻找。
  return ordersTab.value === 'active' ? readyFirst(list) : list;
});
const ordersEmptyTitle = computed(() => {
  if (!orders.value.length) return tt('第一杯，还在等你', 'Your first moment awaits');
  if (ordersTab.value === 'completed') return tt('还没有已完成的订单', 'No completed orders yet');
  if (ordersTab.value === 'closed') return tt('没有已取消的订单', 'No cancelled orders');
  return tt('此刻没有进行中的订单', 'Nothing in progress right now');
});
const ordersEmptyHint = computed(() => {
  if (!orders.value.length) return tt('支付完成后，订单会出现在这里。', 'Your orders will appear here after payment.');
  if (ordersTab.value === 'completed') return tt('出餐或提货完成的订单会收进这里。', 'Orders you have collected are kept here.');
  if (ordersTab.value === 'closed') return tt('取消和退款的订单放在这里，不打扰进行中的茶单。', 'Cancelled and refunded orders stay here, away from active ones.');
  return tt('制作中、待出餐和待提货的订单会出现在这里。', 'Brewing, ready and pickup orders appear here.');
});
const pickups = computed(
  () => orders.value.filter((order) => order.business === 'retail' && order.status === 'awaiting').length
);

// 首页取茶入口只看仍需要到店的已支付订单。
// 已出餐是顾客唯一要行动的时刻：优先展示并直接露出取餐号；制作中只作为轻提示。
const resumePickupList = computed(() => pickupOrders(orders.value));
const resumeReadyList = computed(() => resumePickupList.value.filter(isReadyPickup));
const resumePendingList = computed(() => resumePickupList.value.filter((order) => !isReadyPickup(order)));
const resumePickup = computed(() => resumePickupList.value[0] || null);
const resumeReady = computed(() => resumeReadyList.value.length > 0);
const resumeReadyCount = computed(() => resumeReadyList.value.length);
const resumePendingCount = computed(() => resumePendingList.value.length);
const resumeCodeOrder = computed(() => {
  if (resumeReadyCount.value === 1) return resumeReadyList.value[0];
  if (!resumeReadyCount.value && resumePendingCount.value === 1) return resumePendingList.value[0];
  return null;
});
const resumeCode = computed(() => {
  const order = resumeCodeOrder.value;
  if (!order) return '';
  // 零售看 4 位提货码，茶饮看订单号；都用真实值，不自己截尾号。
  return isRetailOrder(order) ? order.pickupCode || '' : order.number || '';
});
const resumeTitle = computed(() => {
  const ready = resumeReadyList.value;
  const pending = resumePendingCount.value;
  if (ready.length > 1) {
    const retail = ready.filter(isRetailOrder).length;
    if (retail === ready.length) return tt(`${ready.length} 单待取货`, `${ready.length} orders to collect`);
    if (!retail) return tt(`${ready.length} 单已出餐`, `${ready.length} orders ready`);
    return tt(`${ready.length} 单可取`, `${ready.length} orders to collect`);
  }
  if (ready.length === 1) {
    return isRetailOrder(ready[0])
      ? tt('可以取货了', 'Ready to collect')
      : tt('可以取茶了', 'Your tea is ready');
  }
  if (pending > 1) return tt(`${pending} 单制作中`, `${pending} orders brewing`);
  return tt('正在制作', 'Brewing');
});
const resumeSub = computed(() => {
  const ready = resumeReadyList.value;
  const pending = resumePendingCount.value;
  const extra = pending
    ? tt(`另有 ${pending} 单制作中`, `${pending} more ${pending === 1 ? 'order' : 'orders'} brewing`)
    : '';
  if (ready.length > 1) {
    const retail = ready.filter(isRetailOrder).length;
    const open =
      retail === ready.length
        ? tt('点开查看提货码', 'Open to see your pickup codes')
        : retail === 0
          ? tt('点开查看取餐号', 'Open to see your pickup numbers')
          : tt('点开查看取餐号与提货码', 'Open to see your pickup numbers and codes');
    return [open, extra].filter(Boolean).join(' · ');
  }
  if (ready.length === 1) {
    const main = isRetailOrder(ready[0])
      ? tt('到店出示提货码', 'Show your pickup code in store')
      : tt('到取餐口报号', 'Tell the counter this number');
    return [main, extra].filter(Boolean).join(' · ');
  }
  return tt('出餐后这里会变成取餐号', 'This becomes your pickup number when ready');
});

const showcaseTone = computed(() => (detail.value ? productTone(detail.value) : 'sage'));

const cities = computed(() =>
  Array.from(
    new Set(
      state.stores
        .filter((item) => item.channels?.mini !== false)
        .map((item) => (locale.value === 'en' ? item.cityEn : item.city))
    )
  )
);
/** 选店弹层按城市列出全部门店；已选门店置顶，其余按与顾客的距离由近到远。 */
const cityStores = computed(() => {
  // 未开通小程序渠道的门店（如旧占位店）不进入顾客选店列表；
  // 已开通渠道但尚未营业的门店保留展示，让顾客看到开业计划，但不能选中。
  const list = state.stores.filter(
    (item) =>
      item.channels?.mini !== false &&
      (locale.value === 'en' ? item.cityEn : item.city) === storeCity.value
  );
  const chosenId = storeChosen.value && state.store ? state.store.id : '';
  // Array.prototype.sort 在现代运行时稳定：距离相同或都没有定位时保持后台维护顺序。
  return list.slice().sort((a, b) => {
    if (chosenId) {
      if (a.id === chosenId) return -1;
      if (b.id === chosenId) return 1;
    }
    const da = userPos.value ? distanceKm(userPos.value, a) : null;
    const db = userPos.value ? distanceKm(userPos.value, b) : null;
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return 0;
  });
});

watch(
  () => screen.value,
  () => {
    scrollTop.value = scrollTop.value === 0 ? 1 : 0;
  }
);

// 订单内回执是子页面，屏幕不变，需要单独把滚动位置带回顶部。
watch(receiptFromOrders, () => {
  scrollTop.value = scrollTop.value === 0 ? 1 : 0;
});

watch(detail, (product) => {
  if (!product) return;
  // 再点同款时预选上次温度/冰量，但保留完整规格弹层，顾客可以改成另一杯冷/热。
  const last = lastSpecFor(state.freshCart, product.id);
  const temps = Array.isArray(product.temps) ? product.temps : [];
  detailTemp.value = last && temps.includes(last.temp) ? last.temp : temps[0] || '热';
  detailIce.value =
    product.ice && detailTemp.value !== '热'
      ? (last && last.ice && iceOptions.includes(last.ice) ? last.ice : '标准冰')
      : '';
  detailQty.value = 1;
});

watch(detailTemp, (value) => {
  if (value === '热' || !detail.value || !detail.value.ice) detailIce.value = '';
  else if (!detailIce.value) detailIce.value = '标准冰';
});

watch(storeOpen, (open) => {
  if (!open) return;
  // 打开选店时才主动询问定位；结算等后台刷新不弹授权框。
  ensureLocation({ prompt: true });
  if (!state.store) return;
  const current = state.stores.find((item) => item.id === state.store.id);
  storeCity.value = current ? (locale.value === 'en' ? current.cityEn : current.city) : cities.value[0] || '';
});

/** 门店列表里的定位提示；不把「没定位」说成错误，也不影响选店。 */
const locationHint = computed(() => {
  if (locationState.value === 'requesting') return tt('正在获取定位…', 'Getting your location…');
  if (locationState.value === 'denied') return tt('未开启定位，门店按默认顺序显示', 'Location is off — stores stay in their default order');
  if (locationState.value === 'system') return tt('手机定位服务未开启，门店按默认顺序显示', 'Phone location is off — stores stay in their default order');
  if (locationState.value === 'failed') return tt('暂时取不到你的位置，门店按默认顺序显示', 'Could not get your location — stores stay in their default order');
  return tt('开启定位后，门店会按与你的距离排序', 'Allow location to sort stores by distance');
});

/** 定位提示右侧动作：拒绝后去设置，其余情况重试。 */
const locationAction = computed(() => {
  if (locationState.value === 'requesting') return '';
  if (locationState.value === 'denied' || locationState.value === 'system') {
    return isWeixin ? tt('去开启', 'Settings') : '';
  }
  return tt('开启定位', 'Use location');
});

/** 选店时请求定位：prompt=true 时允许弹微信原生授权框，后台刷新保持静默。 */
function ensureLocation(options = {}) {
  if (userPos.value) return Promise.resolve();
  if (locationPending) return locationPending;
  // #ifdef MP-WEIXIN
  return requestWxLocation(Boolean(options.prompt));
  // #endif
  // #ifndef MP-WEIXIN
  return requestH5Location();
  // #endif
}

/** 用户点「去开启 / 去设置」：区分小程序权限与手机系统定位，尽量一步带回。 */
function onLocationAction() {
  // #ifdef MP-WEIXIN
  if (locationState.value === 'system') {
    if (typeof wx !== 'undefined' && typeof wx.openAppAuthorizeSetting === 'function') {
      wx.openAppAuthorizeSetting({
        success: () => {
          locationState.value = 'idle';
          ensureLocation({ prompt: true });
        },
        fail: () => notify(tt('请到手机设置中为微信开启定位', 'Allow location for WeChat in your phone settings'), 'danger')
      });
    } else {
      notify(tt('请到手机设置中为微信开启定位', 'Allow location for WeChat in your phone settings'), 'danger');
    }
    return;
  }
  if (locationState.value === 'denied') {
    uni.openSetting({
      success: (res) => {
        if (res && res.authSetting && res.authSetting['scope.userLocation']) {
          locationState.value = 'idle';
          ensureLocation({ prompt: true });
        } else {
          notify(tt('仍未开启定位，门店会继续按默认顺序显示', 'Location is still off — stores stay in their default order'), 'danger');
        }
      },
      fail: () => notify(tt('无法打开设置，请到微信设置中允许定位', 'Open WeChat settings to allow location'), 'danger')
    });
    return;
  }
  // #endif
  ensureLocation({ prompt: true });
}

/** 微信端先查授权状态：从未询问时由顾客点击触发原生弹窗，已拒绝时不再反复打扰。 */
// #ifdef MP-WEIXIN
function requestWxLocation(prompt) {
  locationState.value = 'requesting';
  locationPending = new Promise((resolve) => {
    const finish = (state) => {
      locationState.value = state;
      locationPending = null;
      resolve();
    };
    const run = () => {
      try {
        uni.getLocation({
          type: 'gcj02',
          success: (res) => {
            const latitude = Number(res && res.latitude);
            const longitude = Number(res && res.longitude);
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              userPos.value = { lat: latitude, lng: longitude };
              finish('granted');
            } else {
              finish('failed');
            }
          },
          fail: (error) => {
            const message = String((error && error.errMsg) || '');
            if (/system permission denied|ERROR_NOCELL&WIFI_LOCATIONSWITCHOFF/i.test(message)) finish('system');
            else finish(/auth|deny|denied|permission|authorize/i.test(message) ? 'denied' : 'failed');
          }
        });
      } catch (error) {
        finish('failed');
      }
    };
    uni.getSetting({
      success: (res) => {
        const scope = res && res.authSetting ? res.authSetting['scope.userLocation'] : undefined;
        if (scope === false) {
          finish('denied');
          return;
        }
        // 只请求状态不弹窗；prompt 时才真正调用定位，避免结算等后台路径突然弹授权。
        if (scope === true || prompt) run();
        else finish('idle');
      },
      fail: () => (prompt ? run() : finish('idle'))
    });
  });
  return locationPending;
}
// #endif

// #ifndef MP-WEIXIN
/** H5 预览用浏览器定位；被拒时提示浏览器授权，不影响选店与下单。 */
function requestH5Location() {
  locationState.value = 'requesting';
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    locationState.value = 'failed';
    return Promise.resolve();
  }
  locationPending = new Promise((resolve) => {
    const finish = (state) => {
      locationState.value = state;
      locationPending = null;
      resolve();
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos && pos.coords && pos.coords.latitude);
        const longitude = Number(pos && pos.coords && pos.coords.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          userPos.value = { lat: latitude, lng: longitude };
          finish('granted');
        } else {
          finish('failed');
        }
      },
      (error) => finish(error && error.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
  return locationPending;
}
// #endif

/** 门店距离文案；没有定位或门店未维护坐标时返回空串，模板按需隐藏。 */
function distanceText(store) {
  if (!userPos.value || !store) return '';
  return formatDistance(distanceKm(userPos.value, store));
}

/** 确认门店弹窗：超过 1km 的距离从地址行拆出，单独高亮提醒顾客核对。 */
const confirmStoreDistance = computed(() => distanceText(state.store));
const confirmStoreFar = computed(() => {
  if (!userPos.value || !state.store) return false;
  return (distanceKm(userPos.value, state.store) || 0) > 1;
});

function notify(message, tone = 'ok') {
  toastText.value = message;
  toastTone.value = tone;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastText.value = '';
  }, 3800);
}

function setLocale(value) {
  locale.value = value;
  try {
    uni.setStorageSync(LOCALE_KEY, value);
  } catch (error) {
    /* ignore */
  }
  if (state.store) {
    const current = state.stores.find((item) => item.id === state.store.id);
    if (current) storeCity.value = value === 'en' ? current.cityEn : current.city;
  }
  notify(value === 'en' ? 'Switched to English' : '已切换为中文');
}

function toggleLocale() {
  setLocale(locale.value === 'zh' ? 'en' : 'zh');
}

/** 退出会员登录：清掉本机令牌，回到未登录态；订单与权益仍保存在服务端。 */
function confirmLogout() {
  uni.showModal({
    title: tt('退出登录', 'Sign out'),
    content: tt(
      '退出后仍可浏览茶单；下单、用券和订单需要重新登录。',
      'You can still browse the menu. Sign in again to order or use coupons.'
    ),
    confirmText: tt('退出登录', 'Sign out'),
    cancelText: tt('取消', 'Cancel'),
    confirmColor: '#a4483c',
    success: (res) => {
      if (!res.confirm) return;
      logout();
      memberOpen.value = false;
      bagOpen.value = false;
      screen.value = 'home';
      notify(tt('已退出登录', 'Signed out'));
    }
  });
}

function go(next) {
  // 任何离开订单的跳转都收起回执子页面，避免下次进入订单时仍停留在旧凭证。
  receiptFromOrders.value = false;
  screen.value = next;
}

async function retry() {
  await init(true);
  if (state.customer) {
    loadOrders();
    loadCoupons();
  }
}

async function loadOrders(options = {}) {
  if (!state.customer) return;
  const silent = Boolean(options.silent);
  if (!silent) ordersLoading.value = true;
  try {
    const result = await api.myOrders();
    orders.value = result.orders || [];
    ordersError.value = '';
  } catch (error) {
    // 失败不再伪装成空单（UI-09）：有旧数据就保留并标注过期，没有就明确报错可重试。
    ordersError.value = (error && error.message) || tt('暂时读不到订单', 'Could not load orders');
  } finally {
    if (!silent) ordersLoading.value = false;
  }
}

async function loadCoupons(options = {}) {
  if (!state.customer) {
    coupons.value = [];
    return;
  }
  const silent = Boolean(options.silent);
  if (!silent) couponsLoading.value = true;
  try {
    const result = await api.myCoupons();
    coupons.value = result.coupons || [];
    couponsError.value = '';
    // 券到手后先自动挑一张本单最划算的，顾客仍可在结算页手动更换。
    if (screen.value === 'checkout' && couponAuto.value) autoPickCoupon();
  } catch (error) {
    if (!silent) couponsError.value = (error && error.message) || tt('暂时读不到权益', 'Could not load benefits');
  } finally {
    if (!silent) couponsLoading.value = false;
  }
}

/** 回执刷新（UI-08）：出餐、交付、退款后顾客可手动刷新状态；失败保留当前内容并提示。 */
async function refreshReceipt() {
  const order = receiptOrder.value;
  if (!order) return;
  try {
    const result = await api.myOrder(order.id);
    receiptOrder.value = result.order;
    notify(tt('已更新到最新状态', 'Updated to the latest status'));
  } catch (error) {
    notify(tt('刷新失败，当前显示的仍是进入时状态', 'Refresh failed. Showing the status from when you opened it.'), 'danger');
  }
}

/** 目录静默刷新（UI-08）：把后台改价/停售带回到袋与价格里，变化明确提示，不静默换价。 */
async function refreshMenuQuietly() {
  const change = await refreshCatalog();
  if (change.removed.length) {
    notify(
      tt(
        `已售罄或下架，已从购物袋移除：${change.removed.map((item) => item.name).join('、')}`,
        `Sold out or delisted, removed from bag: ${change.removed.map((item) => item.nameEn || item.name).join(', ')}`
      ),
      'warn'
    );
  }
  if (change.priceChanged.length) {
    notify(
      tt(
        `价格已更新，请以结算页为准：${change.priceChanged.map((item) => item.name).join('、')}`,
        `Prices updated, see checkout: ${change.priceChanged.map((item) => item.nameEn || item.name).join(', ')}`
      ),
      'warn'
    );
  }
}

function navGo(key) {
  if (key === 'menu') {
    openMenu('all');
    return;
  }
  if (key === 'orders') {
    // 已经在订单里查看回执时，点「订单」等于关闭子页面回到列表，不重新拉取、不丢筛选。
    if (receiptFromOrders.value) {
      receiptFromOrders.value = false;
      return;
    }
    if (!state.customer) {
      openLogin(() => {
        go('orders');
        loadOrders();
      });
      return;
    }
    loadOrders();
    go(key);
    return;
  }
  if (key === 'profile' && state.customer) loadBrand();
  go(key);
}

function goPickups() {
  ordersTab.value = 'active';
  if (!state.customer) {
    openLogin(() => goPickups());
    return;
  }
  go('orders');
  loadOrders();
}

function openMenu(series) {
  menuSeries.value = series;
  go('menu');
}

function pickSeries(series) {
  menuSeries.value = series;
}

function onSearch(event) {
  menuQuery.value = event.detail.value;
}

function clearFilters() {
  menuSeries.value = 'all';
  menuTemp.value = '全部';
  menuQuery.value = '';
}

function openStores() {
  storeOpen.value = true;
}

function closeStores() {
  storeOpen.value = false;
  reopenConfirmAfterStore.value = false;
}

/** 确认弹层里选择换店：先关闭确认层，选店后自动回到确认层。 */
function changeStoreFromConfirm() {
  confirmOpen.value = false;
  reopenConfirmAfterStore.value = true;
  storeOpen.value = true;
}

async function pickStore(item) {
  if (!item || !item.id) return;
  if (!item.open) {
    notify(
      tt(
        `${sn(item)} ${item.hours}，敬请期待`,
        `${sn(item)} ${item.hours} — stay tuned`
      ),
      'ok'
    );
    return;
  }
  await chooseStore(item.id);
  storeOpen.value = false;
  if (reopenConfirmAfterStore.value) {
    reopenConfirmAfterStore.value = false;
    confirmOpen.value = true;
  }
}

/** 扫桌签入口：直接唤起微信相机，不再先弹一层「打开摄像头」的中间步骤。 */
function openTableScan() {
  scanTable();
}

function openRetailDetail(item, categoryId) {
  const matched = state.products.find((product) => product.id === item.id);
  detail.value = matched
    ? { ...matched, kind: 'retail' }
    : { id: item.id, name: item.name, nameEn: item.name, series: 'retail', kind: 'retail', categoryId };
}

/**
 * 首页轮播跳转只走站内去处（后台配置）。
 * 目标被下架或删除时明确提示，避免点了没反应让人以为卡住。
 */
function onBannerTap(banner) {
  if (!banner || !banner.linkType || banner.linkType === 'none') return;
  const value = banner.linkValue || '';
  if (banner.linkType === 'menu') {
    openMenu('all');
    return;
  }
  if (banner.linkType === 'series') {
    openMenu(['xing', 'song', 'qing', 'mian'].includes(value) ? value : 'all');
    return;
  }
  if (banner.linkType === 'retail') {
    navGo('retail');
    return;
  }
  if (banner.linkType === 'orders') {
    navGo('orders');
    return;
  }
  if (banner.linkType === 'profile') {
    navGo('profile');
    return;
  }
  if (banner.linkType !== 'product') return;
  const product = state.products.find((item) => item.id === value);
  if (product) {
    if (product.kind === 'retail') openRetailDetail(product, product.categoryId);
    else detail.value = product;
    return;
  }
  const retail = state.retail.find((item) => item.id === value);
  if (retail) {
    openRetailDetail(retail, categoryOf(retail.id));
    return;
  }
  notify(tt('这件商品暂时不在售', 'This item is not available right now'), 'info');
}

function retailArt(line) {
  return { id: line.item.id, name: line.item.name, series: 'retail', kind: 'retail', categoryId: line.categoryId, imageUrl: line.item.imageUrl };
}

/* ------------------------------ 加购反馈 ------------------------------ */

function freshQty(productId) {
  return productQtyInCart(state.freshCart, productId);
}

function retailQty(itemId) {
  return state.retailCart.reduce(
    (total, line) => (line.item && line.item.id === itemId ? total + (line.qty || 0) : total),
    0
  );
}

function rectOf(selector) {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(instance && instance.proxy)
      .select(selector)
      .boundingClientRect((rect) => resolve(rect || null))
      .exec();
  });
}

/** 只在小程序里给一次轻震动；H5 没有马达，也不弹系统提示。 */
function tapFeedback() {
  // #ifdef MP-WEIXIN
  try {
    uni.vibrateShort({ type: 'light', fail: () => {} });
  } catch (error) {
    /* 部分机型没有马达，忽略 */
  }
  // #endif
}

function markRecent(productId) {
  recentAddId.value = productId || '';
  if (recentTimer) clearTimeout(recentTimer);
  recentTimer = setTimeout(() => {
    recentAddId.value = '';
  }, 520);
}

function bumpBag() {
  bagBump.value = false;
  if (bumpTimer) clearTimeout(bumpTimer);
  // 先归零再在下一帧加上，连续加购时动画能重新播放。
  nextTick(() => {
    bagBump.value = true;
    bumpTimer = setTimeout(() => {
      bagBump.value = false;
    }, 520);
  });
}

/** 杯子从点击位置飞向购物袋；目标或起点取不到时静默跳过，不影响加购结果。 */
function launchFly(from, to, product) {
  if (!from || !to || !product) return;
  const size = 44;
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - (startX + size / 2);
  const dy = to.top + to.height / 2 - (startY + size / 2);
  flyProduct.value = product;
  flyStyle.value = `left:${startX}px;top:${startY}px;width:${size}px;height:${size}px;transform:translate3d(0,-3px,0) scale(1);opacity:1;`;
  flyVisible.value = true;
  if (flyTimer) clearTimeout(flyTimer);
  nextTick(() => {
    setTimeout(() => {
      flyStyle.value = `left:${startX}px;top:${startY}px;width:${size}px;height:${size}px;transform:translate3d(${dx}px,${dy}px,0) scale(.3);opacity:.18;`;
    }, 24);
  });
  flyTimer = setTimeout(() => {
    flyVisible.value = false;
    flyProduct.value = null;
  }, 640);
}

async function celebrateAdd({ product, sourceRect = null }) {
  tapFeedback();
  markRecent(product && product.id);
  bumpBag();
  await nextTick();
  const target = await rectOf('.bag-icon');
  launchFly(sourceRect, target, product);
}

/**
 * 列表 + 号：有温度/冰量可选的茶先进规格弹层，预选上次规格；
 * 同款想一杯热一杯冷时，在弹层改温度即可各成一行。
 */
async function quickAddTea(product) {
  if (!product) return;
  if (product.available === false) {
    notify(tt('本店暂时售罄', 'Sold out at this store'), 'warn');
    return;
  }
  if (needsSpecChoice(product)) {
    detail.value = product;
    return;
  }
  const sourceRect = await rectOf(`#add-${product.id}`);
  addFresh(product, { temp: (product.temps && product.temps[0]) || '热', ice: null, qty: 1 });
  await celebrateAdd({ product, sourceRect });
}

/** 零售没有温度/冰量，加号直接加入；点商品名仍可查看详情。 */
async function quickAddRetail(item, categoryId) {
  if (!item) return;
  const sourceRect = await rectOf(`#retail-add-${item.id}`);
  addRetail(item, 1, categoryId);
  await celebrateAdd({
    product: {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      series: 'retail',
      kind: 'retail',
      categoryId,
      imageUrl: item.imageUrl
    },
    sourceRect
  });
}

async function addFromSheet() {
  const product = detail.value;
  if (!product) return;
  const options = {
    temp: detailTemp.value,
    ice: product.ice && detailTemp.value !== '热' ? detailIce.value : null,
    qty: detailQty.value
  };
  // 详情是居中弹层，先量加购按钮的位置，关掉弹层后再让杯子从原位置飞出。
  const sourceRect = await rectOf('#detail-add');
  if (product.kind === 'retail') {
    const item = state.retail.find((entry) => entry.id === product.id);
    if (!item) return;
    addRetail(item, options.qty, product.categoryId);
  } else if (product.available === false) {
    notify(tt('本店暂时售罄', 'Sold out at this store'), 'warn');
    detail.value = null;
    return;
  } else {
    addFresh(product, options);
  }
  detail.value = null;
  await celebrateAdd({ product, sourceRect });
}

function startCheckout(kind) {
  if (!state.customer) {
    openLogin(() => startCheckout(kind));
    return;
  }
  if (kind === 'fresh' && !storeChosen.value) {
    storeOpen.value = true;
    return;
  }
  checkoutKind.value = kind;
  payError.value = '';
  // 每次进入结算都重新自动选券；顾客在结算页手动清空后本单不再强行加回。
  couponAuto.value = true;
  selectedCouponId.value = '';
  ensureLocation();
  go('checkout');
  // 结算前重新报价（UI-08）：进结算页即静默刷新目录，改价/售罄在支付前可见。
  refreshMenuQuietly();
  loadCoupons({ silent: true });
}

function backFromCheckout() {
  go(checkoutKind.value === 'fresh' ? 'menu' : 'retail');
}

/** 购物袋弹层结算：先收起弹层，再走原结算入口（保留登录与选店校验）。 */
function checkoutFromBag() {
  if (!bagLines.value.length) return;
  bagOpen.value = false;
  startCheckout(bagKind.value);
}

/**
 * 未支付取消后的「再来一单」：回到原门店，按当前目录重新装袋，再进结算。
 * 价格、售罄与优惠都以现在为准；上一单已退掉的部分不再放回。
 */
async function reorder(order) {
  if (!order) return;
  if (!state.customer) {
    openLogin(() => reorder(order));
    return;
  }
  const kind = order.business === 'retail' ? 'retail' : 'fresh';
  const targetStoreId = kind === 'retail' ? order.pickupStoreId || order.storeId : order.storeId;
  const items = (order.items || []).filter((item) => (item.remainingQty ?? item.qty) > 0);
  if (!items.length) {
    notify(tt('这一单已没有可再加的商品', 'Nothing left to add from this order'), 'warn');
    return;
  }
  try {
    // 先回到原门店并刷新目录：改价、售罄、下架都要在装袋前看到。
    if (targetStoreId && (!state.store || state.store.id !== targetStoreId)) {
      await chooseStore(targetStoreId);
      if (state.store && state.store.id === targetStoreId) {
        notify(tt(`已切换到${state.store.name}`, `Switched to ${state.store.name}`));
      }
    } else {
      await refreshCatalog();
    }
  } catch (error) {
    notify(
      (error && error.message) || tt('门店目录读取失败，请稍后重试', 'Could not load the store menu. Please try again.'),
      'err'
    );
    return;
  }
  if (!state.store || (targetStoreId && state.store.id !== targetStoreId)) {
    notify(tt('门店信息读取失败，请稍后重试', 'Store unavailable. Please try again.'), 'err');
    return;
  }
  const currentLines = kind === 'retail' ? state.retailCart.length : state.freshCart.length;
  const fill = () => fillBagFromOrder(order, kind, items);
  if (currentLines) {
    uni.showModal({
      title: tt('替换购物袋', 'Replace bag'),
      content: tt('购物袋里还有未结算的商品，用这一单重新装满？', 'Your bag has items. Refill it with this order?'),
      confirmText: tt('替换', 'Replace'),
      cancelText: tt('取消', 'Cancel'),
      success: (res) => {
        if (res.confirm) fill();
      }
    });
    return;
  }
  fill();
}

/** 按当前目录把订单商品装回购物袋；下架/售罄的条目跳过并如实提示数量。 */
function fillBagFromOrder(order, kind, items) {
  let added = 0;
  let skipped = 0;
  if (kind === 'retail') {
    clearCart('retail');
    for (const item of items) {
      const retail = state.retail.find((row) => row.id === item.productId);
      if (!retail || retail.available === false) {
        skipped += 1;
        continue;
      }
      addRetail(retail, Math.min(20, item.remainingQty ?? item.qty), retail.categoryId);
      added += 1;
    }
  } else {
    clearCart('fresh');
    for (const item of items) {
      const product = state.products.find((row) => row.id === item.productId);
      if (!product || product.available === false) {
        skipped += 1;
        continue;
      }
      // 季节/配方调整后原温度可能已不存在，回退到当前可选的第一种。
      const temp =
        product.temps && product.temps.length && !product.temps.includes(item.temp)
          ? product.temps[0]
          : item.temp;
      addFresh(product, { temp, ice: item.ice, qty: Math.min(20, item.remainingQty ?? item.qty) });
      added += 1;
    }
  }
  if (!added) {
    notify(tt('这一单的商品在本店暂时售罄', 'Items from this order are sold out at this store'), 'warn');
    return;
  }
  if (skipped) {
    notify(
      tt(
        `部分商品已售罄或下架，已跳过 ${skipped} 项`,
        `${skipped} item(s) sold out or delisted and skipped`
      ),
      'warn'
    );
  }
  if (kind === 'fresh') {
    const positions = (state.store && state.store.positions) || [];
    // 桌号只在当天有效：拿昨天的订单「再来一单」时不把旧桌号带回来，只沿用用餐方式。
    const orderIsToday = isSameVisitDay(order.createdAt, Date.now());
    if (
      order.type === 'dine' &&
      order.seat &&
      orderIsToday &&
      (!positions.length || positions.includes(order.seat))
    ) {
      setSeat(order.seat);
    } else {
      setDining(order.type === 'dine' ? 'dine' : 'takeaway');
    }
  }
  // 从订单子页直接进结算，返回时回到茶单/零售，而不是停在一张已取消的回执上。
  receiptFromOrders.value = false;
  startCheckout(kind);
}

function clearBag() {
  if (!bagLines.value.length) return;
  uni.showModal({
    title: tt('清空购物袋', 'Clear bag'),
    content: tt('确定移除袋内全部商品？', 'Remove everything from your bag?'),
    confirmText: tt('清空', 'Clear'),
    cancelText: tt('取消', 'Cancel'),
    success: (res) => {
      if (!res.confirm) return;
      clearCart(bagKind.value);
      bagOpen.value = false;
    }
  });
}

function bagLineName(kind, key) {
  const lines = kind === 'retail' ? state.retailCart : state.freshCart;
  const line = lines.find((entry) => entry.key === key);
  if (!line) return '';
  if (line.product) return pn(line.product);
  return line.item ? line.item.name : '';
}

/**
 * 数量按钮：减到 0 等于移除这一项，先二次确认再移出购物袋。
 * 与常见茶饮品牌一致，避免误点一减就把商品从袋里删掉。
 */
function decreaseQty(kind, key) {
  const lines = kind === 'retail' ? state.retailCart : state.freshCart;
  const line = lines.find((entry) => entry.key === key);
  if (!line) return;
  if (line.qty > 1) {
    changeQty(kind, key, -1);
    return;
  }
  const name = bagLineName(kind, key);
  uni.showModal({
    title: tt('移出购物袋', 'Remove from bag'),
    content: tt(`将「${name}」移出购物袋？`, `Remove ${name} from your bag?`),
    confirmText: tt('移出', 'Remove'),
    cancelText: tt('保留', 'Keep'),
    success: (res) => {
      if (res.confirm) changeQty(kind, key, -1);
    }
  });
}

function onPay() {
  if (!state.customer) {
    openLogin(() => onPay());
    return;
  }
  if (!storeChosen.value) {
    storeOpen.value = true;
    return;
  }
  payError.value = '';
  ensureLocation();
  confirmOpen.value = true;
}

/**
 * 支付完成后确认到账。
 * 渠道的异步通知可能晚于 wx.requestPayment 返回，这里只轮询服务端状态；
 * 回调没到之前绝不本地假定成功，回执继续如实显示「待支付」。
 */
async function confirmOrderPaid(orderId, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await api.getOrderPayment(orderId);
      if (result && result.order) {
        receiptOrder.value = result.order;
        if (result.order.paymentStatus === 'paid') return result.order;
        if (result.order.status === 'cancelled') return null;
      }
    } catch (error) {
      // 网络抖动继续等下一轮；最终未确认时由调用方如实提示。
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  return null;
}

/** 支付未完成：先向服务端确认确实未到账，再取消订单释放库存与优惠券。 */
async function cancelUnpaidAfterPayment(orderId) {
  try {
    const status = await api.getOrderPayment(orderId);
    if (status && status.order) {
      receiptOrder.value = status.order;
      if (status.order.paymentStatus === 'paid' || status.order.status === 'cancelled') {
        return status.order;
      }
    }
    const cancelled = await api.cancelOrder(orderId);
    if (cancelled && cancelled.order) receiptOrder.value = cancelled.order;
  } catch (error) {
    // 取消失败不改变提示：订单保持待支付，门店可见，资金未扣。
  }
  return null;
}

async function payNow() {
  paying.value = true;
  payError.value = '';
  try {
    const result = await submitOrder(checkoutKind.value, {
      couponId: checkoutCoupon.value ? checkoutCoupon.value.id : undefined
    });
    receiptOrder.value = result.order;
    confirmOpen.value = false;
    selectedCouponId.value = '';
    go('receipt');
    loadOrders();
    loadCoupons({ silent: true });
    // 微信小程序内走 JSAPI 支付适配层（后端 prepay 下发参数）；H5 预览不提供支付。
    if (IS_WEIXIN_MP) {
      try {
        const prepared = await api.prepay(result.order.id);
        // mock 适配层在服务端已按模拟扣款记账，订单是否已支付以回执上的服务端状态为准。
        // 登录可以是 live 而支付仍是 mock：以 prepayMode 判断参数是否真实，避免把模拟回执交给 wx.requestPayment。
        const prepayMode = (prepared && (prepared.prepayMode || prepared.mode)) || 'mock';
        if (prepayMode !== 'mock') {
          const paid = await requestPayment(prepared && prepared.payment);
          if (paid.ok) {
            const confirmed = await confirmOrderPaid(result.order.id);
            if (confirmed) {
              loadOrders();
              notify(tt('支付成功，茶正在为你现做', 'Paid. Your tea is being prepared.'));
            } else {
              notify(tt('支付结果确认中，请稍后在回执或订单里查看', 'Confirming payment. Check the receipt shortly.'), 'warn');
            }
          } else {
            await cancelUnpaidAfterPayment(result.order.id);
            loadOrders();
            loadCoupons({ silent: true });
            const cancelled = /cancel/i.test(String(paid.error || ''));
            notify(
              cancelled
                ? tt('已取消支付，本单未扣款，订单已取消', 'Payment cancelled. Nothing was charged; the order is cancelled.')
                : tt(`支付未完成：${paid.error || '请稍后重试'}，本单未扣款`, `Payment not completed: ${paid.error || 'please retry'}. Nothing was charged.`),
              'danger'
            );
          }
        }
      } catch (error) {
        // UI-01：prepay/JSAPI 异常如实提示未完成；订单取消释放库存，绝不提示成功。
        await cancelUnpaidAfterPayment(result.order.id);
        loadOrders();
        loadCoupons({ silent: true });
        notify(
          tt(
            `支付未完成：${(error && error.message) || '网络异常'}，本单未扣款`,
            `Payment not completed: ${(error && error.message) || 'network error'}. Nothing was charged.`
          ),
          'danger'
        );
      }
    }
    if (result.printError) {
      notify(tt(`已下单，标签打印未完成：${result.printError}`, `Order placed. Label print failed: ${result.printError}`), 'danger');
    }
  } catch (error) {
    payError.value = (error && error.message) || tt('下单失败，请稍后重试', 'Could not place the order');
  } finally {
    paying.value = false;
  }
}

/**
 * 桌签扫码：小程序内直接调用 wx.scanCode，识别后立即换店落桌并默认店内享用。
 * H5 没有摄像头，提示到小程序里操作；不再提供手动选择门店与桌号的降级表单。
 */
async function scanTable() {
  if (!IS_WEIXIN_MP) {
    notify(tt('请在微信小程序内扫描桌签', 'Scan the table QR inside the WeChat mini program'));
    return;
  }
  try {
    const raw = await scanCode(tt('扫描桌签二维码', 'Scan the table QR'));
    if (!raw) return;
    const parsed = parseTableCode(raw);
    if (!parsed) {
      notify(tt('这不是本店桌签，请扫描桌面上的二维码', 'This is not a store table tag. Scan the QR on the table.'), 'danger');
      return;
    }
    const matchedStore = state.stores.find((item) => item.id === parsed.storeId);
    if (!matchedStore) {
      notify(tt('桌签所属门店暂不可用，请联系店员', 'That store is unavailable right now. Please ask a staff member.'), 'danger');
      return;
    }
    const positions = matchedStore.positions || [];
    if (positions.length && !positions.includes(parsed.seat)) {
      notify(
        tt(`「${parsed.seat}」桌签已失效，请让店员重新张贴`, `Table "${parsed.seat}" is no longer valid. Ask staff to replace the tag.`),
        'danger'
      );
      return;
    }
    await applyTable(matchedStore.id, parsed.seat);
    notify(
      `${tt('已扫桌签', 'Table scanned')}：${sn(matchedStore)} · ${sp(parsed.seat)}，${tt('默认店内享用', 'dine-in selected')}`
    );
  } catch (error) {
    // 用户主动取消扫码不是错误，不弹红色提示。
    const message = String((error && (error.errMsg || error.message)) || '');
    if (/cancel/i.test(message)) return;
    notify(tt('没有读取到桌签，请重试', 'Table QR not recognised. Please try again.'), 'danger');
  }
}

/* ------------------------------ 登录与权益 ------------------------------ */

/**
 * 登录门：未登录时打开登录弹层，登录成功后继续原动作。
 * 手机号是会员唯一身份，不再提供匿名会话或「先登录、后绑定」的路径。
 */
function openLogin(next) {
  if (state.customer) {
    if (typeof next === 'function') next();
    return;
  }
  if (typeof next === 'function') pendingAfterLogin = next;
  loginError.value = '';
  // 每次打开登录弹层都从未勾选开始，隐私协议必须由顾客自己确认。
  loginConsent.value = false;
  consentOpen.value = false;
  loginOpen.value = true;
}

function closeLogin() {
  if (loginSaving.value) return;
  loginOpen.value = false;
  consentOpen.value = false;
  loginError.value = '';
  loginConsent.value = false;
  pendingAfterLogin = null;
}

function toggleLoginConsent() {
  loginConsent.value = !loginConsent.value;
  if (loginConsent.value && loginError.value) loginError.value = '';
}

/** 未勾选协议时点击登录：先确认条款，不在按钮上直接抛红字。 */
function requestLoginConsent() {
  if (loginSaving.value) return;
  loginError.value = '';
  consentOpen.value = true;
}

function cancelLoginConsent() {
  if (loginSaving.value) return;
  // 拒绝只是回到登录层，协议保持未勾选；不追加红字责备，按钮仍可再次点击确认。
  consentOpen.value = false;
}

/**
 * 确认层里的「同意并登录」本身就是 getPhoneNumber 按钮：
 * 同一次点击即完成勾选与微信手机号授权，不需要再回上一层点一次。
 * 若顾客在微信授权弹窗中取消，勾选保留（已同意条款），但登录不完成。
 */
function onConsentPhone(event) {
  loginConsent.value = true;
  consentOpen.value = false;
  onLoginPhone(event);
}

/** 用户协议与隐私政策是独立页面，登录弹层与个人中心都从这里进入。 */
function openLegal(tab = 'privacy') {
  uni.navigateTo({ url: `/pages/legal/index?tab=${tab === 'terms' ? 'terms' : 'privacy'}` });
}

/**
 * getPhoneNumber 授权回调：wx.login 的 code 换 openId，手机号授权 code 换手机号。
 * 页面先要求顾客勾选协议，勾选后才渲染 getPhoneNumber 按钮；微信官方隐私弹窗照常保留。
 * 立即失败时把原因归类，避免所有情况都显示同一句“需要授权手机号”。
 */
async function onLoginPhone(event) {
  const payload = phonePayload(event);
  if (!payload) {
    const failure = phoneAuthFailure(event);
    if (failure && failure.raw) console.warn('[login] getPhoneNumber failed:', failure.raw);
    // 顾客主动取消不算错误，不再弹红字。
    if (failure && failure.reason === 'cancelled') return;
    if (failure && failure.reason === 'privacy') {
      loginError.value = tt(
        '隐私授权未完成，请重试；若仍失败请联系门店伙伴',
        'Privacy authorisation is incomplete. Please retry or contact a store partner.'
      );
    } else if (failure && failure.reason === 'permission') {
      loginError.value = tt(
        '当前小程序未开通手机号快速验证，请联系门店伙伴',
        'Phone verification is not enabled for this mini program. Please contact a store partner.'
      );
    } else {
      loginError.value = tt('手机号授权失败，请重试', 'Phone authorisation failed. Please try again.');
    }
    return;
  }
  loginSaving.value = true;
  loginError.value = '';
  try {
    const code = await wxLogin();
    const customer = await api.loginWithWechat({ code: code || undefined, phoneCode: payload.code });
    await finishLogin(customer);
  } catch (error) {
    loginError.value = (error && error.message) || tt('登录失败，请重试', 'Could not sign in');
  } finally {
    loginSaving.value = false;
  }
}

async function finishLogin(customer) {
  setCustomer(customer);
  loginOpen.value = false;
  consentOpen.value = false;
  loginError.value = '';
  notify(tt('登录成功', 'Signed in'));
  // 扫会员码小程序码但未登录：登录完成后立即领取，并回到会员页看结果。
  const pendingGift = takePendingGift();
  if (pendingGift) {
    try {
      const res = await claimGiftCode(pendingGift);
      const days = res && res.days;
      uni.showToast({
        title: res && res.replayed ? '这个会员码已兑换过' : days ? `已领取 ${days} 天会员` : '会员码已领取',
        icon: 'none'
      });
      setTimeout(() => {
        uni.navigateTo({ url: '/pages/brand-member/index' });
      }, 900);
    } catch (err) {
      uni.showToast({ title: (err && err.message) || '会员码领取失败，请稍后重试', icon: 'none' });
    }
  }
  await loadCoupons({ silent: true });
  const next = pendingAfterLogin;
  pendingAfterLogin = null;
  if (typeof next === 'function') await next();
}

async function openAssets(mode = 'coupons') {
  if (!state.customer) {
    openLogin(() => openAssets(mode));
    return;
  }
  couponPicker.value = false;
  assetsOpen.value = true;
  await loadCoupons();
}

function openCouponPicker() {
  if (!state.customer) {
    openLogin(openCouponPicker);
    return;
  }
  couponPicker.value = true;
  assetsOpen.value = true;
  loadCoupons();
}

function closeAssets() {
  assetsOpen.value = false;
  couponPicker.value = false;
}

function pickCoupon(coupon) {
  if (!couponPicker.value) return;
  const fit = couponFits(coupon);
  if (!fit.ok) {
    notify(fit.reason || tt('这张券本单不可用', 'This coupon cannot be used in this order'), 'warn');
    return;
  }
  selectedCouponId.value = coupon.id;
  // 手动选券后不再被自动选券覆盖，直到下一次进入结算。
  couponAuto.value = false;
  closeAssets();
}

function clearCoupon() {
  selectedCouponId.value = '';
  // 顾客主动不用券：本单保持不选，避免自动选券立刻加回来。
  couponAuto.value = false;
  closeAssets();
}

function useCoupons() {
  closeAssets();
  openMenu('all');
}

function couponStatusText(status) {
  const labels = {
    available: tt('可用', 'Available'),
    pending: tt('未生效', 'Not yet'),
    reserved: tt('使用中', 'In use'),
    used: tt('已使用', 'Used'),
    expired: tt('已过期', 'Expired'),
    inactive: tt('已停用', 'Inactive')
  };
  return labels[status] || status;
}

function couponScopeText(coupon) {
  if (coupon.scope === 'all') return tt('全品类可用', 'All items');
  const category = state.categories.find((item) => item.id === coupon.categoryId);
  return category
    ? tt(`${category.name} 专用`, `${category.nameEn || category.name} only`)
    : tt('指定品类', 'Selected category');
}

function dayText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('.');
}

function isRetailOrder(order) {
  return Boolean(order && (order.business === 'retail' || order.type === 'retail'));
}

/* ------------------------------ 个人资料 ------------------------------ */

function openProfileEdit() {
  if (!state.customer) {
    openLogin(() => openProfileEdit());
    return;
  }
  profileForm.name = state.customer.name || '';
  profileForm.gender = state.customer.gender ?? null;
  profileForm.birthday = state.customer.birthday || '';
  profileError.value = '';
  profileOpen.value = true;
}

function closeProfileEdit() {
  profileOpen.value = false;
  profileError.value = '';
}

function onProfileName(event) {
  profileForm.name = String((event.detail && event.detail.value) || '').slice(0, 12);
}

function pickGender(value) {
  profileForm.gender = profileForm.gender === value ? null : value;
}

function onBirthday(event) {
  profileForm.birthday = (event.detail && event.detail.value) || '';
}

async function saveProfile() {
  if (profileSaving.value) return;
  const name = profileForm.name.replace(/\s+/g, ' ').trim();
  if (!name) {
    profileError.value = tt('请填写姓名', 'Please enter your name');
    return;
  }
  if (name.length > 12) {
    profileError.value = tt('姓名不能超过 12 个字', 'Your name can be at most 12 characters');
    return;
  }
  profileSaving.value = true;
  profileError.value = '';
  try {
    const result = await api.updateProfile({
      name,
      gender: profileForm.gender ?? null,
      birthday: profileForm.birthday || null
    });
    if (result && result.customer) state.customer = result.customer;
    profileOpen.value = false;
    notify(tt('资料已保存', 'Profile saved'));
  } catch (error) {
    profileError.value = tt(
      (error && error.message) || '资料保存失败',
      (error && error.message) || 'Could not save your profile'
    );
  } finally {
    profileSaving.value = false;
  }
}

/** 小程序 chooseAvatar 回调：拿到临时文件后读成 base64 直传。 */
async function onChooseAvatar(event) {
  const path = event && event.detail && event.detail.avatarUrl;
  if (!path) return;
  await uploadAvatarFrom(path);
}

/** H5 与未授权场景：从相册或相机选一张。 */
async function pickAvatarFromAlbum() {
  try {
    const path = await chooseImageFile();
    if (path) await uploadAvatarFrom(path);
  } catch (error) {
    notify(tt('未选择图片', 'No image selected'));
  }
}

async function uploadAvatarFrom(path) {
  if (avatarSaving.value) return;
  avatarSaving.value = true;
  profileError.value = '';
  try {
    const file = await readFileAsBase64(path);
    if (!file) throw new Error('读取图片失败');
    const result = await api.uploadAvatar(file);
    if (result && result.customer) state.customer = result.customer;
    notify(tt('头像已更新', 'Avatar updated'));
  } catch (error) {
    profileError.value = tt(
      (error && error.message) || '头像上传失败',
      (error && error.message) || 'Could not upload the avatar'
    );
  } finally {
    avatarSaving.value = false;
  }
}

async function openReceipt(order) {
  receiptOrder.value = order;
  // 不切屏、不切标签：回执作为订单列表的子页面出现，关闭后回到同一筛选和列表。
  receiptFromOrders.value = true;
  try {
    const result = await api.myOrder(order.id);
    receiptOrder.value = result.order;
  } catch (error) {
    /* keep the list snapshot */
  }
}

/** 关闭订单内的提货码/取茶凭证子页面，保留订单筛选与已加载列表。 */
function closeReceipt() {
  receiptFromOrders.value = false;
}

// 左滑返回：与在场一致，子页面从右向左滑动超过 70px 且横向为主时回到订单列表。
let receiptTouchStart = null;
const touchX = (touch) => (touch ? Number(touch.clientX ?? touch.pageX ?? 0) : 0);
const touchY = (touch) => (touch ? Number(touch.clientY ?? touch.pageY ?? 0) : 0);

function onReceiptTouchStart(event) {
  const touch = event && event.touches && event.touches[0];
  if (!touch) return;
  receiptTouchStart = { x: touchX(touch), y: touchY(touch) };
}

function onReceiptTouchEnd(event) {
  const start = receiptTouchStart;
  receiptTouchStart = null;
  if (!start || !receiptFromOrders.value) return;
  const touch = event && event.changedTouches && event.changedTouches[0];
  if (!touch) return;
  const dx = touchX(touch) - start.x;
  const dy = touchY(touch) - start.y;
  if (dx <= -70 && Math.abs(dy) <= 60) closeReceipt();
}

/**
 * 首页入口：只有一单可取时直接打开它，哪怕还有别的在制作；
 * 两单以上可取、或全部制作中且不止一单时进入「进行中」列表，由顾客自己选。
 */
async function resumeReceipt() {
  const target = pickupTarget(orders.value);
  if (!target) {
    if (resumePickupList.value.length) goPickups();
    return;
  }
  try {
    const result = await api.myOrder(target.id);
    // 首页停留期间订单可能已被取消或完成；取到最新状态后再决定是否还展示凭证。
    // 这里只校验订单是否仍可取，不按一小时窗口拒绝：顾客已经点开的凭证不应因刚过整点而失效。
    if (!isPickupOrder(result.order)) {
      loadOrders({ silent: true });
      notify(tt('这单已经结束，取茶入口已收起', 'That order has ended, so the receipt is tucked away'));
      return;
    }
    receiptOrder.value = result.order;
    go('receipt');
  } catch (error) {
    if (error && error.status === 404) {
      loadOrders({ silent: true });
      notify(tt('这单已经结束，取茶入口已收起', 'That order has ended, so the receipt is tucked away'));
      return;
    }
    notify(tt('暂时取不到取茶凭证，请稍后再试', 'Could not load the receipt. Please try again.'));
  }
}

function storeNameFor(order) {
  if (isRetailOrder(order)) return tt('任意门店领取', 'Collect at any store');
  const store = state.stores.find((item) => item.id === order.storeId);
  return store ? sn(store) : order.storeName;
}

/** 订单卡上的「地点 · 时间」：零售没有固定门店，就把领取方式和下单时间并列。 */
function orderMeta(order) {
  return [storeNameFor(order), orderTimeText(order)].filter(Boolean).join(' · ');
}

function orderTimeText(order) {
  const value = order && order.createdAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hour}:${minute}`;
}

/** 顾客视角的状态：茶饮与零售分开说人话，不把内部 delivered 直接显示成「已交付」。 */
function orderStatusText(order) {
  if (!order) return '';
  if (order.status === 'cancelled') return tt('已取消', 'Cancelled');
  if (order.status === 'refunded') return tt('已退款', 'Refunded');
  if (order.paymentStatus !== 'paid') return tt('待支付', 'Unpaid');
  const retail = isRetailOrder(order);
  if (order.status === 'delivered') return retail ? tt('已提货', 'Collected') : tt('已完成', 'Completed');
  if (order.status === 'ready') return retail ? tt('待提货', 'Ready') : tt('已出餐', 'Ready');
  if (order.status === 'awaiting') return tt('待提货', 'Ready');
  if (order.status === 'pending') return tt('制作中', 'Brewing');
  return os(order.status);
}

function orderStatusClass(order) {
  if (!order) return '';
  if (order.status === 'cancelled' || order.status === 'refunded') return 'closed';
  if (order.paymentStatus !== 'paid') return 'warn';
  if (order.status === 'pending') return 'calm';
  return 'green';
}

function itemsLine(order) {
  return (order.items || []).map((item) => `${item.name} ×${item.qty}`).join(' / ');
}

/** 小程序已在运行时扫桌签：App.vue 写入缓存后通知首页，这里换店换桌并提示。 */
async function onScene(payload) {
  if (!payload || !payload.storeId) return;
  const store = state.stores.find((item) => item.id === payload.storeId);
  if (!store) {
    notify(tt('桌签所属门店暂不可用，请联系店员', 'That store is unavailable. Please ask a staff member.'), 'danger');
    return;
  }
  const positions = store.positions || [];
  if (payload.seat && positions.length && !positions.includes(payload.seat)) {
    notify(
      tt(`「${payload.seat}」桌签已失效，请让店员重新张贴`, `Table "${payload.seat}" is no longer valid. Ask staff to replace the tag.`),
      'danger'
    );
    return;
  }
  try {
    await applyTable(payload.storeId, payload.seat);
    notify(
      tt(`已带入 ${sn(state.store)} · ${state.seat}`, `Store and table set to ${sn(state.store)} · ${state.seat}`)
    );
  } catch (error) {
    notify(tt('桌签上的门店暂不可用，请手动选择', 'That store is unavailable. Please choose manually.'), 'danger');
  }
}

/* ------------------------------ 分享给朋友 ------------------------------ */

const SHARE_TITLES = {
  zh: 'Full愈·时叙｜一杯茶，回到此刻。',
  en: 'Full愈 · Tea Hour — a moment, all yours.'
};

const shareTitle = () => SHARE_TITLES[locale.value] || SHARE_TITLES.zh;

// 右上角「…」转发：卡片落到首页。个人中心另有海报入口，两者互不替代。
onShareAppMessage(() => ({
  title: shareTitle(),
  path: '/pages/index/index',
  imageUrl: '/static/tea.webp'
}));

onShareTimeline(() => ({
  title: shareTitle(),
  imageUrl: '/static/tea.webp'
}));

function openShare() {
  shareOpen.value = true;
  loadShareCode();
}

/**
 * 小程序码由服务端调用微信 getUnlimited 生成并缓存；这里只负责取图。
 * 失败时保留真实原因到控制台，界面只给出可读提示，不画一个假二维码。
 */
function loadShareCode() {
  if (shareCodeImage.value) return Promise.resolve(shareCodeImage.value);
  if (shareCodePending) return shareCodePending;
  shareCodeError.value = '';
  shareCodePending = api
    .shareCode()
    .then((res) => {
      if (!res || !res.image) {
        throw new Error('share code response missing image');
      }
      shareCodeImage.value = res.image;
      return res.image;
    })
    .catch((error) => {
      console.warn('[share] code unavailable:', error && error.message);
      shareCodeError.value = tt('小程序码暂不可用', 'Code unavailable right now');
      return '';
    })
    .then((value) => {
      shareCodePending = null;
      return value;
    });
  return shareCodePending;
}

/** 失败后允许顾客自己重试，避免一次网络抖动就整张海报不可用。 */
function reloadShareCode() {
  shareCodeImage.value = '';
  shareCodeError.value = '';
  shareCodePending = null;
  return loadShareCode();
}

/** 小程序码是 base64 data URL；先落成临时文件，部分机型 canvas.createImage 读 data URL 会失败。 */
function writeShareImage(base64) {
  return new Promise((resolve) => {
    const match = /^data:image\/(\w+);base64,(.*)$/.exec(String(base64 || ''));
    if (!match) {
      resolve('');
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filePath = `${wx.env.USER_DATA_PATH}/share-code.${ext}`;
    uni.getFileSystemManager().writeFile({
      filePath,
      data: match[2],
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: (error) => {
        console.warn('[share] code file failed:', error && error.errMsg);
        resolve('');
      }
    });
  });
}

/**
 * 包内 LOGO 换成本地路径：先按带/不带前导斜杠两种写法各问一次 getImageInfo；
 * 都取不到时，把包内图片直接读到用户目录，再交给 canvas。
 * 只有全部失败才让海报回退成文字。
 */
function resolveShareLogo() {
  const original = shareLogo.value;
  return new Promise((resolve) => {
    const candidates = logoSrcCandidates(original);
    const tryNext = (index) => {
      if (index >= candidates.length) {
        copyShareLogo(original).then((path) => resolve(path ? { src: path, candidates: [path] } : null));
        return;
      }
      uni.getImageInfo({
        src: candidates[index],
        success: (info) => {
          const path = info && (info.path || info.tempFilePath);
          if (path) resolve({ src: path, candidates: [path, ...candidates] });
          else tryNext(index + 1);
        },
        fail: (error) => {
          console.warn('[share] logo lookup failed:', candidates[index], error && error.errMsg);
          tryNext(index + 1);
        }
      });
    };
    tryNext(0);
  });
}

/** getImageInfo 读不到包内图片时，复制到 USER_DATA_PATH 再让 canvas 读。 */
function copyShareLogo(src) {
  const env = typeof wx !== 'undefined' ? wx.env : null;
  if (typeof uni.getFileSystemManager !== 'function' || !env || !env.USER_DATA_PATH) {
    return Promise.resolve('');
  }
  const fs = uni.getFileSystemManager();
  const target = `${env.USER_DATA_PATH}/share-logo-${Date.now()}.png`;
  return new Promise((resolve) => {
    fs.readFile({
      filePath: String(src).replace(/^\//, ''),
      encoding: 'base64',
      success: (file) => {
        fs.writeFile({
          filePath: target,
          data: file.data,
          encoding: 'base64',
          success: () => resolve(target),
          fail: (error) => {
            console.warn('[share] logo write failed:', error && error.errMsg);
            resolve('');
          }
        });
      },
      fail: (error) => {
        console.warn('[share] logo read failed:', error && error.errMsg);
        resolve('');
      }
    });
  });
}

function loadCanvasImage(canvas, src, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    // 个别机型既不触发 onload 也不触发 onerror，超时后明确失败，避免一直停在「正在生成海报」。
    const timer = setTimeout(() => finish(reject, new Error('image load timeout')), timeout);
    const image = canvas.createImage();
    image.onload = () => finish(resolve, image);
    image.onerror = (error) => finish(reject, error || new Error('image load failed'));
    image.src = src;
  });
}

function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      destWidth: POSTER_WIDTH,
      destHeight: POSTER_HEIGHT,
      fileType: 'png',
      success: (out) => {
        if (out && out.tempFilePath) resolve(out.tempFilePath);
        else reject(new Error('empty poster file'));
      },
      fail: reject
    });
  });
}

function waitFrame(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把小程序码画进品牌海报并保存到相册；只在微信小程序内可用。 */
async function saveSharePoster() {
  // #ifdef MP-WEIXIN
  if (!shareCodeImage.value || shareSaving.value) return;
  shareSaving.value = true;
  uni.showLoading({ title: tt('正在生成海报', 'Creating poster'), mask: true });

  const done = () => {
    uni.hideLoading();
    shareSaving.value = false;
  };

  try {
    const [codePath, logo] = await Promise.all([
      writeShareImage(shareCodeImage.value),
      resolveShareLogo()
    ]);

    const canvas = await new Promise((resolve, reject) => {
      uni
        .createSelectorQuery()
        .in(instance && instance.proxy)
        .select('#share-poster')
        .fields({ node: true, size: true }, (res) => {
          if (res && res.node) resolve(res.node);
          else reject(new Error('canvas node missing'));
        })
        .exec();
    });

    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context missing');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    const codeImage = await loadCanvasImage(canvas, codePath || shareCodeImage.value);
    let logoImage = null;
    if (logo) {
      // 同一个 LOGO 有几种写法，逐个试；后面的重试缩短超时，避免整张海报卡太久。
      for (const src of logo.candidates) {
        try {
          logoImage = await loadCanvasImage(canvas, src, logoImage ? 2500 : 5000);
          break;
        } catch (error) {
          console.warn('[share] logo draw skipped:', src, error && (error.errMsg || error.message));
        }
      }
    }

    drawSharePoster(ctx, codeImage, { lang: locale.value, logoImage });
    // 少数机型导出前需要一帧时间让绘制结果落盘。
    await waitFrame(80);
    const posterPath = await exportCanvas(canvas);

    try {
      await new Promise((resolve, reject) => {
        uni.saveImageToPhotosAlbum({ filePath: posterPath, success: resolve, fail: reject });
      });
      done();
      notify(tt('海报已保存到相册', 'Poster saved'), 'ok');
    } catch (error) {
      done();
      const message = String((error && error.errMsg) || '');
      if (/cancel/i.test(message)) return;
      if (/auth|deny|denied|authorize/i.test(message)) {
        uni.showModal({
          title: tt('需要相册权限', 'Album permission needed'),
          content: tt(
            '请在设置中允许保存到相册，再试一次。',
            'Allow saving to your album in Settings, then try again.'
          ),
          confirmText: tt('去设置', 'Settings'),
          success: (result) => {
            if (result.confirm) uni.openSetting();
          }
        });
        return;
      }
      // 未在公众平台声明相册权限或个别机型写入失败时，改为预览长按保存。
      console.warn('[share] save to album failed:', message);
      uni.showModal({
        title: tt('保存失败', 'Could not save'),
        content: tt(
          '可长按预览图保存到相册，或在微信设置中允许保存图片。',
          'Press and hold the preview to save it, or allow photo saving in WeChat Settings.'
        ),
        confirmText: tt('预览图片', 'Preview'),
        cancelText: tt('取消', 'Cancel'),
        success: (result) => {
          if (result.confirm) uni.previewImage({ urls: [posterPath], current: posterPath });
        }
      });
    }
  } catch (error) {
    done();
    console.warn('[share] poster failed:', error && (error.errMsg || error.message));
    notify(tt('海报生成失败，请重试', 'Could not create the poster. Please try again.'));
  }
  // #endif
}

/** H5 预览没有微信转发与相册，退回复制访问链接。 */
function copyShareLink() {
  uni.setClipboardData({
    data: 'https://teahour.fullyu.cn',
    success: () => notify(tt('访问链接已复制', 'Link copied'))
  });
}

onMounted(async () => {
  uni.$on('teahour:scene', onScene);
  // 不注册 onNeedPrivacyAuthorization：保留微信官方隐私弹窗，首次授权一次后不再重复。
  await init();
  // uni-app H5 的 scroll-view 内层是可滚动 div，补上键盘焦点以支持键盘用户（小程序端无 document）。
  if (typeof document !== 'undefined') {
    const scroller = document.querySelector('.phone-content .uni-scroll-view .uni-scroll-view');
    if (scroller) scroller.setAttribute('tabindex', '0');
  }
  if (state.customer) {
    loadOrders();
    loadCoupons({ silent: true });
    loadBrand();
  }
  if (state.store) {
    const current = state.stores.find((item) => item.id === state.store.id);
    storeCity.value = current ? (locale.value === 'en' ? current.cityEn : current.city) : cities.value[0] || '';
  }
});

// 回前台（UI-08）：目录与订单静默刷新，让改价、售罄、出餐、退款跨端可见；
// init 内部也会触发一次目录刷新，这里补订单、权益与变化提示。
onShow(() => {
  // 扫会员码小程序码进来但还没登录：自动打开登录层，登录后 finishLogin 自动领取。
  if (!state.customer && !giftLoginPrompted && peekPendingGift()) {
    giftLoginPrompted = true;
    uni.showToast({ title: '登录后自动领取会员码', icon: 'none' });
    setTimeout(() => openLogin(), 500);
  }
  if (state.customer) {
    loadOrders({ silent: true });
    loadCoupons({ silent: true });
  }
  refreshMenuQuietly();
});

onUnmounted(() => {
  uni.$off('teahour:scene', onScene);
  [bumpTimer, recentTimer, flyTimer].forEach((timer) => {
    if (timer) clearTimeout(timer);
  });
});
</script>
