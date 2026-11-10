<template>
  <view class="input-panel">
    <!-- 聊天消息区域 -->
    <view class="message-list">
      <view class="message-item" v-for="(message, index) in messageList"  :key="index" :class="{ 'self': message.isSelf }">
        <view class="avatar">
          <image :src="message.isSelf ? selfAvatar : otherAvatar" mode="aspectFill"></image>
        </view>
        <view class="content">
          <view 
            class="text-content" 
            v-if="message.type === 'text'">
            {{ message.content }}
          </view>
          <view 
            class="voice-content" 
            v-else-if="message.type === 'voice'"
            @click="playVoice(message)">
            <text>{{ message.duration }}''</text>
            <view class="voice-waves">
              <view class="wave" 
                :style="{ height: '20px' }"
                v-for="(item, i) in 3" 
                :key="i"
              ></view>
            </view>
          </view>
        </view>
      </view>
    </view>
    
    <!-- 输入区域 -->
    <view class="input-area">
      <!-- 语音/键盘切换按钮 -->
      <view class="toggle-btn"  @click="toggleInputMode">
        <image :src="inputMode === 'voice' ? keyboardIcon : voiceIcon" mode="aspectFit"></image>
      </view>
      
      <!-- 文字输入框 -->
      <view class="text-input" v-if="inputMode === 'text'">
        <input 
          type="text" 
          placeholder="请输入消息..." 
          v-model="textContent"
          @confirm="sendTextMessage">
      </view>
      
      <!-- 语音输入按钮 -->
      <view class="voice-input" 
        v-else
        :class="{ 'recording': recording }"
        @touchstart="startRecord" 
        @touchend="endRecord" 
        @touchmove="handleTouchMove" >
        <text>{{ recording ? '松开结束' : '按住说话' }}</text>
        <view class="record-hint" v-if="cancelRecord">
          <text>松开手指取消发送</text>
        </view>
      </view>
      
      <!-- 发送按钮 -->
      <view class="btn btn-modify" @click="sendTextMessage" v-if="inputMode === 'text' && textContent.trim()">
        <text>发送</text>
      </view>
    </view>
    
    <!-- 录音状态指示器 -->
    <view class="record-status" v-if="recording && !cancelRecord">
      <view class="record-indicator"></view>
      <text class="record-time">{{ formatTime(recordingTime) }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onBeforeUnmount, watch } from 'vue';

// 状态管理
const recording = ref(false);
const recordingTime = ref(0);
const recordInterval = ref(null);
const touchStartY = ref(0);
const cancelRecord = ref(false);
const tempFilePath = ref('');
const voiceList = ref([]);
const inputMode = ref('text'); // 'text' 或 'voice'
const textContent = ref('');
const messageList = ref([
  // 示例消息
  {
    id: 1,
    type: 'text',
    content: '你好！今天过得怎么样？',
    isSelf: false,
    time: '09:30'
  },
  {
    id: 2,
    type: 'text',
    content: '我很好，谢谢！你呢？',
    isSelf: true,
    time: '09:31'
  }
]);

// 常量定义
const selfAvatar = 'https://picsum.photos/id/1005/200/200';
const otherAvatar = 'https://picsum.photos/id/1012/200/200';
const voiceIcon = '/static/icons/microphone-solid.svg';
const keyboardIcon = '/static/icons/keyboard-regular.svg';

// 录音管理器和音频上下文
const recorderManager = uni.getRecorderManager();
const innerAudioContext = uni.createInnerAudioContext();

// 格式化时间
const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 切换输入模式
const toggleInputMode = () => {
  inputMode.value = inputMode.value === 'text' ? 'voice' : 'text';
};

// 开始录音
const startRecord = (e) => {
  touchStartY.value = e.touches[0].clientY;
  cancelRecord.value = false;
  
  const options = {
    format: 'mp3',
    sampleRate: 44100,
    numberOfChannels: 1,
    encodeBitRate: 192000,
    frameSize: 50
  };
  
  recorderManager.start(options);
};

// 结束录音
const endRecord = () => {
  if (recording.value) {
    recorderManager.stop();
  }
};

// 处理触摸移动
const handleTouchMove = (e) => {
  if (!recording.value) return;
  
  const currentY = e.touches[0].clientY;
  // 判断是否上滑超过50px，如果是则取消发送
  if (touchStartY.value - currentY > 50) {
    cancelRecord.value = true;
  } else {
    cancelRecord.value = false;
  }
};

// 播放语音
const playVoice = (message) => {
  if (message.type !== 'voice') return;
  
  innerAudioContext.src = message.content;
  innerAudioContext.play();
};

// 发送文字消息
const sendTextMessage = () => {
  if (!textContent.value.trim()) return;
  
  const newMessage = {
    id: messageList.value.length + 1,
    type: 'text',
    content: textContent.value.trim(),
    isSelf: true,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  
  messageList.value.push(newMessage);
  textContent.value = '';
  
  // 模拟回复
  setTimeout(() => {
    const replyMessage = {
      id: messageList.value.length + 1,
      type: 'text',
      content: '我收到了你的消息："' + newMessage.content + '"',
      isSelf: false,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messageList.value.push(replyMessage);
  }, 1000);
};

// 监听录音事件
recorderManager.onStart(() => {
  recording.value = true;
  recordingTime.value = 0;
  recordInterval.value = setInterval(() => {
    recordingTime.value++;
  }, 1000);
});

recorderManager.onStop((res) => {
  clearInterval(recordInterval.value);
  recording.value = false;
  
  if (!cancelRecord.value && res.duration > 1000) {
    // 录音时间大于1秒才保存
    tempFilePath.value = res.tempFilePath;
    const voiceItem = {
      tempFilePath: res.tempFilePath,
      duration: Math.floor(res.duration / 1000)
    };
    
    // 直接发送语音消息
    const newMessage = {
      id: messageList.value.length + 1,
      type: 'voice',
      content: voiceItem.tempFilePath,
      duration: voiceItem.duration,
      isSelf: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    messageList.value.push(newMessage);
    
    // 模拟回复
    setTimeout(() => {
      const replyMessage = {
        id: messageList.value.length + 1,
        type: 'text',
        content: '我听到了你的语音消息，时长：' + voiceItem.duration + '秒',
        isSelf: false,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      messageList.value.push(replyMessage);
    }, 1000);
  }
  
  cancelRecord.value = false;
});

recorderManager.onError((err) => {
  console.error('recorder error', err);
  clearInterval(recordInterval.value);
  recording.value = false;
  uni.showToast({
    title: '录音失败',
    icon: 'none'
  });
});

// 监听语音播放事件
innerAudioContext.onEnded(() => {
  console.log('audio play ended');
});

innerAudioContext.onError((err) => {
  console.error('audio play error', err);
  uni.showToast({
    title: '播放失败',
    icon: 'none'
  });
});

// 生命周期钩子
onMounted(() => {
  // 组件挂载时的初始化操作
});

onBeforeUnmount(() => {
  // 清除定时器
  clearInterval(recordInterval.value);
  
  // 销毁录音管理器和音频上下文
  if (recorderManager) {
    recorderManager.stop();
  }
  
  if (innerAudioContext) {
    innerAudioContext.destroy();
  }
});
</script>

<style lang="scss" scoped>
.input-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
  
  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: 30rpx;
    
    .message-item {
      display: flex;
      margin-bottom: 30rpx;
      
      &.self {
        flex-direction: row-reverse;
      }
      
      .avatar {
        width: 80rpx;
        height: 80rpx;
        border-radius: 50%;
        overflow: hidden;
        
        image {
          width: 100%;
          height: 100%;
        }
      }
      
      .content {
        max-width: 70%;
        margin: 0 20rpx;
        padding: 20rpx 30rpx;
        border-radius: 20rpx;
        position: relative;
        
        &::before {
          content: '';
          position: absolute;
          top: 30rpx;
          width: 0;
          height: 0;
          border-top: 16rpx solid transparent;
          border-bottom: 16rpx solid transparent;
        }
      }
      
      .text-content {
        border-radius: 20rpx;
        padding: 16rpx 24rpx;
        box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.1);
      }
      
      .voice-content {
        background-color: white;
        border-radius: 20rpx;
        padding: 16rpx 24rpx;
        box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        
        .voice-waves {
          display: flex;
          align-items: flex-end;
          margin-left: 20rpx;
          
          .wave {
            width: 6rpx;
            margin: 0 2rpx;
            background-color: #584219;
            border-radius: 6rpx;
          }
        }
      }
      
      &.self .content {
        background-color: #584219;
        color: white;
        
        &::before {
          right: -20rpx;
          border-left: 20rpx solid #584219;
        }
      }
      
      &.self .voice-content {
        background-color: #584219;
        
        .wave {
          background-color: white;
        }
      }
      
      &:not(.self) .content::before {
        left: -20rpx;
        border-right: 20rpx solid white;
      }
    }
  }
  
  .input-area {
    display: flex;
    align-items: center;
    padding: 20rpx 30rpx;
    background-color: white;
    border-top: 2rpx solid #eee;
    
    .toggle-btn {
      image {
        width: 60rpx;
        height: 60rpx;
        margin-right: 20rpx;
        object-fit: contain;
        vertical-align: bottom;
      }
    }
    
    .text-input {
      flex: 1;
      height: 70rpx;
      background-color: #f5f5f5;
      border-radius: 40rpx;
      padding: 0 30rpx;
      
      input {
        width: 100%;
        height: 100%;
      }
    }
    
    .voice-input {
      flex: 1;
      height: 70rpx;
      background-color: #584219;
      color: white;
      border-radius: 40rpx;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      
      &.recording {
        background-color: #E64340;
      }
      
      .record-hint {
        position: absolute;
        bottom: -60rpx;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10rpx 20rpx;
        border-radius: 10rpx;
        font-size: 24rpx;
      }
    }
    
    .send-btn {
      width: 120rpx;
      height: 70rpx;
      background-color: #584219;
      color: white;
      border-radius: 40rpx;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-left: 20rpx;
    }
  }
  
  .record-status {
    position: fixed;
    bottom: 160rpx;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 20rpx 30rpx;
    border-radius: 20rpx;
    display: flex;
    align-items: center;
    
    .record-indicator {
      width: 20rpx;
      height: 20rpx;
      background-color: red;
      border-radius: 50%;
      margin-right: 20rpx;
      animation: blink 1s infinite;
    }
    
    .record-time {
      font-size: 28rpx;
    }
  }
}

@keyframes blink {
  0% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}
</style>
