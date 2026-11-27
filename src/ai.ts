import type { AppSettings, Category, EventItem } from './types'

export type AiActions = {
  createEvent: (input: Partial<EventItem> & { title: string }) => EventItem
  updateEvent: (id: string, patch: Partial<EventItem>) => EventItem | null
  deleteEvent: (id: string) => boolean
  createCategory: (name: string, color?: string) => Category
  updateCategory: (id: string, patch: Partial<Category>) => Category | null
  deleteCategory: (id: string) => boolean
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: '新建一个倒数日/纪念日事件。未来日期自动成为倒数，过去日期自动成为正数。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事件名称' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD（公历）' },
          categoryId: { type: 'string', description: '分类 ID，不填则用当前全部分类' },
          icon: { type: 'string', description: '一个 emoji 图标' },
          note: { type: 'string', description: '备注' },
          lunar: { type: 'boolean', description: '是否按农历重复/显示' },
          repeat: { type: 'string', enum: ['none', 'yearly'], description: '是否每年重复' },
        },
        required: ['title', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description: '修改已有事件的名称、日期、分类、颜色、图标、备注。需先根据事件名称找到 id。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '事件 ID' },
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          categoryId: { type: 'string' },
          icon: { type: 'string' },
          note: { type: 'string' },
          color: { type: 'string', description: '#RRGGBB' },
          lunar: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'delete_event', description: '删除一个事件', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: '新建一个事件分类',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: '#RRGGBB' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: '修改分类名称或颜色',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'delete_category', description: '删除一个分类', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  },
]

function callAi(messages: any[], settings: AppSettings): Promise<any> {
  return fetch(settings.aiBaseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.aiKey}`,
    },
    body: JSON.stringify({
      model: settings.aiModel,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    }),
  }).then(async (r) => {
    const txt = await r.text()
    if (!r.ok) throw new Error(`AI ${r.status}: ${txt.slice(0, 200)}`)
    return JSON.parse(txt)
  })
}

export async function runAiCommand(
  text: string,
  settings: AppSettings,
  actions: AiActions,
  context: { categories: Category[]; events: EventItem[] },
): Promise<string> {
  if (!settings.aiKey.trim()) throw new Error('请先在「更多 → 设置」中填写 AI API Key')

  const system = {
    role: 'system',
    content: `你是「纪念日」App 的数据管家。用户用自然语言管理倒数日和分类，你通过工具函数完成增删改。
当前日期：${new Date().toISOString().slice(0, 10)}
现有分类：${context.categories.map((c) => `${c.id}=${c.name}`).join('、') || '无'}
现有事件：${context.events.map((e) => `${e.id}=${e.title}(${e.date})`).join('、') || '无'}
规则：
1. 用户说“生日/纪念日/考试/旅行”等且未指定分类时，放到已有分类中最贴切的一个；没有合适的就新建分类。
2. “去年/前天/N天后/下个月X号”等相对日期请换算成具体 YYYY-MM-DD。
3. 修改或删除前先用现有事件列表匹配 id；匹配不到就反问用户，不要猜测。
4. 操作完成后用一句简短中文回复确认。`,
  }

  const messages: any[] = [system, { role: 'user', content: text }]
  const first = await callAi(messages, settings)
  const choice = first.choices?.[0]?.message
  if (!choice) throw new Error('AI 未返回结果')

  if (!choice.tool_calls?.length) return choice.content || '（无回复）'

  messages.push(choice)
  const summaries: string[] = []
  for (const call of choice.tool_calls) {
    const args = JSON.parse(call.function.arguments || '{}')
    let result: any
    try {
      switch (call.function.name) {
        case 'create_event': {
          const ev = actions.createEvent(args)
          result = { ok: true, id: ev.id, title: ev.title, date: ev.date }
          break
        }
        case 'update_event': {
          const { id, ...patch } = args
          const ev = actions.updateEvent(id, patch)
          result = ev ? { ok: true, id: ev.id } : { ok: false, error: '事件不存在' }
          break
        }
        case 'delete_event': {
          result = { ok: actions.deleteEvent(args.id) }
          break
        }
        case 'create_category': {
          const c = actions.createCategory(args.name, args.color)
          result = { ok: true, id: c.id, name: c.name }
          break
        }
        case 'update_category': {
          const { id, ...patch } = args
          const c = actions.updateCategory(id, patch)
          result = c ? { ok: true, id: c.id } : { ok: false, error: '分类不存在' }
          break
        }
        case 'delete_category': {
          result = { ok: actions.deleteCategory(args.id) }
          break
        }
        default:
          result = { ok: false, error: '未知操作' }
      }
    } catch (e: any) {
      result = { ok: false, error: e?.message || String(e) }
    }
    summaries.push(`${call.function.name}: ${JSON.stringify(result)}`)
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
  }

  try {
    const second = await callAi(messages, settings)
    return second.choices?.[0]?.message?.content || summaries.join('\n')
  } catch {
    return `已完成操作：${summaries.join('；')}`
  }
}
