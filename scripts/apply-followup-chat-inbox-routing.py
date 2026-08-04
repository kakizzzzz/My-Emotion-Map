from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one replacement, found {count}')
    target.write_text(text.replace(old, new), encoding='utf-8')


replace_once(
    'src/domain/followUps.ts',
    '''export const promoteNextDueFollowUp = (\n  records: FollowUpRecord[],\n  now = new Date(),\n): FollowUpRecord[] => {\n  const nowTime = now.getTime();\n  const normalized = records.map((record) => {\n    if (\n      record.status === 'active' &&\n      new Date(record.dueAt).getTime() > nowTime\n    ) {\n      return { ...record, status: 'queued' as const, promptedAt: undefined };\n    }\n    return record;\n  });\n  const active = normalized\n    .filter((record) => record.status === 'active')\n    .sort(\n      (left, right) =>\n        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),\n    );\n  if (active.length) {\n    const keepId = active[0].id;\n    return normalized.map((record) =>\n      record.status === 'active' && record.id !== keepId\n        ? { ...record, status: 'queued' as const, promptedAt: undefined }\n        : record,\n    );\n  }\n  const next = normalized\n    .filter(\n      (record) =>\n        record.status === 'queued' &&\n        new Date(record.dueAt).getTime() <= nowTime,\n    )\n    .sort(\n      (left, right) =>\n        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),\n    )[0];\n  if (!next) return normalized;\n  const promptedAt = now.toISOString();\n  return normalized.map((record) =>\n    record.id === next.id\n      ? { ...record, status: 'active' as const, promptedAt }\n      : record,\n  );\n};''',
    '''/**\n * A queued record with promptedAt has already been routed to Star Inbox.\n * A queued record without promptedAt is still future or not yet routed.\n */\nexport const isInboxFollowUp = (\n  record: Pick<FollowUpRecord, 'status' | 'dueAt' | 'promptedAt'>,\n  now: Date | number = Date.now(),\n) => {\n  const nowTime = typeof now === 'number' ? now : now.getTime();\n  return record.status === 'queued' &&\n    Boolean(record.promptedAt) &&\n    new Date(record.dueAt).getTime() <= nowTime;\n};\n\nexport const promoteNextDueFollowUp = (\n  records: FollowUpRecord[],\n  now = new Date(),\n): FollowUpRecord[] => {\n  const nowTime = now.getTime();\n  const routedAt = now.toISOString();\n  const normalized = records.map((record) => {\n    const dueTime = new Date(record.dueAt).getTime();\n    const routedPending =\n      record.status === 'active' ||\n      (record.status === 'queued' && Boolean(record.promptedAt));\n    if (routedPending && dueTime > nowTime) {\n      return {\n        ...record,\n        status: 'queued' as const,\n        promptedAt: undefined,\n        seenAt: undefined,\n      };\n    }\n    return record;\n  });\n\n  const active = normalized\n    .filter((record) => record.status === 'active')\n    .sort(\n      (left, right) =>\n        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),\n    );\n  const keepActiveId = active[0]?.id;\n  const withSingleChatSlot = normalized.map((record) => {\n    if (record.status !== 'active') return record;\n    if (record.id === keepActiveId) {\n      return record.promptedAt ? record : { ...record, promptedAt: routedAt };\n    }\n    return {\n      ...record,\n      status: 'queued' as const,\n      promptedAt: record.promptedAt ?? routedAt,\n      seenAt: undefined,\n    };\n  });\n\n  const newlyDue = withSingleChatSlot\n    .filter(\n      (record) =>\n        record.status === 'queued' &&\n        !record.promptedAt &&\n        new Date(record.dueAt).getTime() <= nowTime,\n    )\n    .sort(\n      (left, right) =>\n        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),\n    );\n  if (!newlyDue.length) return withSingleChatSlot;\n\n  const chatCandidateId = keepActiveId ? undefined : newlyDue[0].id;\n  const newlyDueIds = new Set(newlyDue.map((record) => record.id));\n  return withSingleChatSlot.map((record) => {\n    if (!newlyDueIds.has(record.id)) return record;\n    return record.id === chatCandidateId\n      ? {\n          ...record,\n          status: 'active' as const,\n          promptedAt: routedAt,\n          seenAt: undefined,\n        }\n      : {\n          ...record,\n          status: 'queued' as const,\n          promptedAt: routedAt,\n          seenAt: undefined,\n        };\n  });\n};''',
)

replace_once(
    'src/app/useFollowUpScheduler.ts',
    ".filter((record) => record.status === 'queued')",
    ".filter((record) => record.status === 'queued' && !record.promptedAt)",
)

replace_once(
    'src/app/useFollowUpCoordinator.ts',
    "  getFollowUpPrompt,\n} from '../domain/followUps';",
    "  getFollowUpPrompt,\n  isInboxFollowUp,\n} from '../domain/followUps';",
)
replace_once(
    'src/app/useFollowUpCoordinator.ts',
    '''      if (\n        !record ||\n        (record.status !== 'active' &&\n          !(record.status === 'queued' && new Date(record.dueAt).getTime() <= Date.now()))\n      ) return;''',
    '''      if (!record) return;\n      const answerable = source === 'chat'\n        ? record.status === 'active'\n        : isInboxFollowUp(record);\n      if (!answerable) return;''',
)
replace_once(
    'src/app/useFollowUpCoordinator.ts',
    '''\n      setConversations((current) => {\n        const companion = current.find(''',
    '''\n      if (source === 'inbox') return;\n\n      setConversations((current) => {\n        const companion = current.find(''',
)

replace_once(
    'src/features/inbox/StarInboxScreen.tsx',
    "  getFollowUpPrompt,\n} from '../../domain/followUps';",
    "  getFollowUpPrompt,\n  isInboxFollowUp,\n} from '../../domain/followUps';",
)
replace_once(
    'src/features/inbox/StarInboxScreen.tsx',
    '''  const queuedFollowUps = followUps\n    .filter(\n      (record) =>\n        record.status === 'active' ||\n        (record.status === 'queued' && new Date(record.dueAt).getTime() <= openedAt),\n    )''',
    '''  const queuedFollowUps = followUps\n    .filter((record) => isInboxFollowUp(record, openedAt))''',
)

replace_once(
    'src/App.tsx',
    "  FOLLOW_UP_CONVERSATION_ID,\n} from './domain/followUps';",
    "  FOLLOW_UP_CONVERSATION_ID,\n  isInboxFollowUp,\n} from './domain/followUps';",
)
replace_once(
    'src/App.tsx',
    '''  const unreadStarInboxCount = followUps.filter(\n    (record) => record.status === 'active' && !record.seenAt,\n  ).length;''',
    '''  const unreadStarInboxCount = followUps.filter(\n    (record) => isInboxFollowUp(record) && !record.seenAt,\n  ).length;''',
)
replace_once(
    'src/App.tsx',
    '''  const openStarInbox = () => {\n    const seenAt = new Date().toISOString();\n    setFollowUps((current) =>\n      current.map((record) =>\n        record.status === 'active' && !record.seenAt\n          ? { ...record, seenAt }\n          : record,\n      ),\n    );''',
    '''  const openStarInbox = () => {\n    const openedAt = Date.now();\n    const seenAt = new Date(openedAt).toISOString();\n    setFollowUps((current) =>\n      current.map((record) =>\n        isInboxFollowUp(record, openedAt) && !record.seenAt\n          ? { ...record, seenAt }\n          : record,\n      ),\n    );''',
)

(ROOT / 'tests/components/followUpInboxHistory.test.tsx').write_text(
    '''import { act, renderHook } from '@testing-library/react';\nimport { useState } from 'react';\nimport { describe, expect, it } from 'vitest';\nimport { useFollowUpCoordinator } from '../../src/app/useFollowUpCoordinator';\nimport { FOLLOW_UP_CONVERSATION_ID } from '../../src/domain/followUps';\nimport type {\n  Conversation,\n  EmotionNote,\n  FollowUpRecord,\n  RevisitRecord,\n} from '../../src/types';\nimport { getAppCopy } from '../../src/i18n';\n\nconst note: EmotionNote = {\n  id: 'note-routing',\n  title: '安静角落',\n  titleSource: 'user',\n  place: '图书馆',\n  date: '2026-08-01',\n  time: '10:00',\n  emotion: 'calm',\n  placeRating: 'comfortable',\n  answers: [],\n  excerpt: '测试记录',\n  followUpEnabled: true,\n};\nconst chatFollowUp: FollowUpRecord = {\n  id: 'follow-up-chat',\n  noteId: note.id,\n  intervalDays: 3,\n  dueAt: '2026-08-04T00:00:00.000Z',\n  status: 'active',\n  promptedAt: '2026-08-04T00:00:00.000Z',\n  promptVersion: 2,\n};\nconst inboxFollowUp: FollowUpRecord = {\n  id: 'follow-up-inbox',\n  noteId: note.id,\n  intervalDays: 7,\n  dueAt: '2026-08-04T00:00:00.000Z',\n  status: 'queued',\n  promptedAt: '2026-08-04T00:00:01.000Z',\n  promptVersion: 2,\n};\nconst companion: Conversation = {\n  id: FOLLOW_UP_CONVERSATION_ID,\n  title: '交流回访',\n  preview: '当前聊天回访',\n  kind: 'companion',\n  unread: true,\n  messages: [{\n    id: 'prompt-chat',\n    role: 'assistant',\n    kind: 'followup_prompt',\n    body: '',\n    followUpId: chatFollowUp.id,\n    noteIds: [note.id],\n  }],\n};\n\nconst useHarness = () => {\n  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([\n    chatFollowUp,\n    inboxFollowUp,\n  ]);\n  const [conversations, setConversations] = useState<Conversation[]>([companion]);\n  const [revisits, setRevisits] = useState<RevisitRecord[]>([]);\n  const coordinator = useFollowUpCoordinator({\n    followUps,\n    setFollowUps,\n    setConversations,\n    setRevisits,\n    notes: [note],\n    activeView: 'map',\n    activeConversationId: FOLLOW_UP_CONVERSATION_ID,\n    language: 'zh',\n    navigationCopy: getAppCopy('zh').navigation,\n  });\n  return { followUps, conversations, revisits, ...coordinator };\n};\n\ndescribe('follow-up chat and inbox history isolation', () => {\n  it('keeps an inbox answer out of companion chat', () => {\n    const { result } = renderHook(useHarness);\n    act(() => {\n      result.current.answerFollowUp(\n        inboxFollowUp.id,\n        '轻了',\n        'lighter',\n        'inbox',\n      );\n    });\n\n    expect(result.current.conversations[0].messages).toEqual(\n      companion.messages,\n    );\n    expect(result.current.followUps.find(\n      (record) => record.id === inboxFollowUp.id,\n    )).toMatchObject({\n      status: 'answered',\n      answeredVia: 'inbox',\n      responseOptionId: 'lighter',\n    });\n  });\n\n  it('writes only the chat-slot answer into companion history', () => {\n    const { result } = renderHook(useHarness);\n    act(() => {\n      result.current.answerFollowUp(\n        chatFollowUp.id,\n        '一样',\n        'same',\n        'chat',\n      );\n    });\n\n    const thread = result.current.conversations[0];\n    expect(thread.messages.map((message) => message.kind)).toEqual([\n      'followup_prompt',\n      'followup_answer',\n      'followup_reply',\n    ]);\n    expect(thread.messages.some(\n      (message) => message.followUpId === inboxFollowUp.id,\n    )).toBe(false);\n    expect(result.current.followUps.find(\n      (record) => record.id === inboxFollowUp.id,\n    )).toMatchObject({ status: 'queued' });\n  });\n});\n''',
    encoding='utf-8',
)

(ROOT / 'tests/unit/followUpRouting.test.ts').write_text(
    '''import { describe, expect, it } from 'vitest';\nimport {\n  isInboxFollowUp,\n  promoteNextDueFollowUp,\n} from '../../src/domain/followUps';\nimport type { FollowUpRecord } from '../../src/types';\n\nconst due = (\n  id: string,\n  dueAt: string,\n  extra: Partial<FollowUpRecord> = {},\n): FollowUpRecord => ({\n  id,\n  noteId: `note-${id}`,\n  intervalDays: 3,\n  dueAt,\n  status: 'queued',\n  promptVersion: 2,\n  ...extra,\n});\n\ndescribe('follow-up chat slot and inbox routing', () => {\n  it('routes one newly due record to chat and additional records to inbox', () => {\n    const now = new Date('2026-08-04T12:00:00.000Z');\n    const routed = promoteNextDueFollowUp([\n      due('first', '2026-08-04T09:00:00.000Z'),\n      due('second', '2026-08-04T10:00:00.000Z'),\n      due('third', '2026-08-05T10:00:00.000Z'),\n    ], now);\n\n    expect(routed.find((record) => record.id === 'first')).toMatchObject({\n      status: 'active',\n      promptedAt: now.toISOString(),\n    });\n    expect(isInboxFollowUp(\n      routed.find((record) => record.id === 'second')!,\n      now,\n    )).toBe(true);\n    expect(routed.find((record) => record.id === 'third')).toMatchObject({\n      status: 'queued',\n      promptedAt: undefined,\n    });\n  });\n\n  it('does not promote an existing inbox backlog after the chat item is answered', () => {\n    const now = new Date('2026-08-04T12:00:00.000Z');\n    const routed = promoteNextDueFollowUp([\n      due('answered-chat', '2026-08-04T09:00:00.000Z', {\n        status: 'answered',\n        promptedAt: '2026-08-04T09:00:00.000Z',\n      }),\n      due('old-inbox', '2026-08-04T10:00:00.000Z', {\n        promptedAt: '2026-08-04T10:00:00.000Z',\n      }),\n    ], now);\n\n    expect(routed.some((record) => record.status === 'active')).toBe(false);\n    expect(isInboxFollowUp(\n      routed.find((record) => record.id === 'old-inbox')!,\n      now,\n    )).toBe(true);\n  });\n\n  it('uses a later newly due record for chat without moving older inbox items', () => {\n    const now = new Date('2026-08-06T12:00:00.000Z');\n    const routed = promoteNextDueFollowUp([\n      due('old-inbox', '2026-08-04T10:00:00.000Z', {\n        promptedAt: '2026-08-04T10:00:00.000Z',\n      }),\n      due('new-chat', '2026-08-06T10:00:00.000Z'),\n      due('new-inbox', '2026-08-06T11:00:00.000Z'),\n    ], now);\n\n    expect(routed.find((record) => record.id === 'new-chat')).toMatchObject({\n      status: 'active',\n    });\n    expect(isInboxFollowUp(\n      routed.find((record) => record.id === 'old-inbox')!,\n      now,\n    )).toBe(true);\n    expect(isInboxFollowUp(\n      routed.find((record) => record.id === 'new-inbox')!,\n      now,\n    )).toBe(true);\n  });\n\n  it('removes routing when the phone clock moves behind the due time', () => {\n    const beforeDue = new Date('2026-08-03T12:00:00.000Z');\n    const routed = promoteNextDueFollowUp([\n      due('chat', '2026-08-04T10:00:00.000Z', {\n        status: 'active',\n        promptedAt: '2026-08-04T10:00:00.000Z',\n      }),\n      due('inbox', '2026-08-04T11:00:00.000Z', {\n        promptedAt: '2026-08-04T11:00:00.000Z',\n        seenAt: '2026-08-04T11:30:00.000Z',\n      }),\n    ], beforeDue);\n\n    expect(routed).toEqual([\n      expect.objectContaining({\n        id: 'chat', status: 'queued', promptedAt: undefined, seenAt: undefined,\n      }),\n      expect.objectContaining({\n        id: 'inbox', status: 'queued', promptedAt: undefined, seenAt: undefined,\n      }),\n    ]);\n  });\n});\n''',
    encoding='utf-8',
)
