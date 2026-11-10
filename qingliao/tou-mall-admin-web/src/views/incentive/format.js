export function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function money(value, digits = 2) {
  return numberValue(value).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function percent(value, digits = 1) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  return numberValue(value).toFixed(digits) + '%'
}

export function decimal(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  return numberValue(value).toFixed(digits).replace(/\.?0+$/, '')
}

export function trainingStatus(progress) {
  if (!progress) {
    return {text: '未登记', type: 'info'}
  }
  if (progress.status === 'uncertified') {
    return {text: '未通过考核', type: 'info'}
  }
  if (progress.status === 'upcoming') {
    return {text: '考核日次日起算', type: 'warning'}
  }
  if (progress.status === 'completed-this-month') {
    return {text: '本月达标', type: 'success'}
  }
  if (progress.status === 'completed') {
    return {text: '已达标', type: 'success'}
  }
  return {text: '累计中', type: 'primary'}
}
