import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listDictSets, getDictItems } from '@/api/dict'

/** 值集单项 */
export interface DictItem {
  id?: string
  value: string
  label: string
  /** 英文展示文案（小程序英文界面用），为空时回退 label */
  labelEn?: string
  /** 可选的颜色标记（用于标签展示） */
  color?: string
  /** 是否启用 */
  enabled: boolean
  /** 排序 */
  sort: number
}

/** 值集（字典） */
export interface DictSet {
  /** 数据库主键（后端 CRUD 用） */
  id?: string
  /** 值集编码，全局唯一 */
  code: string
  /** 值集名称 */
  name: string
  /** 值集说明 */
  desc?: string
  /** 是否系统内置（内置不可删除，仅可编辑项） */
  system: boolean
  items: DictItem[]
}

export const useDictStore = defineStore('dict', () => {
  const dicts = ref<DictSet[]>([])
  const loaded = ref(false)

  /** 从后端加载全部值集（含选项） */
  async function load(force = false) {
    if (loaded.value && !force) return
    const list = await listDictSets()
    dicts.value = (list || []).map((s: any) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      desc: s.desc,
      system: s.system,
      items: (s.items || []).map((i: any) => ({
        id: i.id,
        value: i.value,
        label: i.label,
        labelEn: i.labelEn,
        color: i.color,
        enabled: i.enabled,
        sort: i.sort,
      })),
    }))
    loaded.value = true
  }

  /** 获取某个值集定义 */
  function getSet(code: string): DictSet | undefined {
    return dicts.value.find((d) => d.code === code)
  }

  /** 获取某个值集启用中的选项（按 sort 排序） */
  function getItems(code: string): DictItem[] {
    const set = getSet(code)
    if (!set) return []
    return [...set.items].filter((i) => i.enabled).sort((a, b) => a.sort - b.sort)
  }

  /** 根据 value 取 label */
  function getLabel(code: string, value: string): string {
    return getSet(code)?.items.find((i) => i.value === value)?.label || value
  }

  /** 直接从后端拉取某个 code 的启用选项（无需先 load 全部） */
  async function fetchItems(code: string): Promise<DictItem[]> {
    const items = await getDictItems(code)
    return (items || []) as DictItem[]
  }

  return { dicts, loaded, load, getSet, getItems, getLabel, fetchItems }
})
