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
    'tests/components/coreFlows.test.tsx',
    """          dueAt: '2026-08-01T00:00:00.000Z',
          status: 'active',
        }]}""",
    """          dueAt: '2026-08-01T00:00:00.000Z',
          status: 'queued',
          promptedAt: '2026-08-01T00:00:01.000Z',
        }]}""",
)

replace_once(
    'tests/unit/followUpRouting.test.ts',
    """    expect(routed.find((record) => record.id === 'third')).toMatchObject({
      status: 'queued',
      promptedAt: undefined,
    });""",
    """    const future = routed.find((record) => record.id === 'third');
    expect(future?.status).toBe('queued');
    expect(future?.promptedAt).toBeUndefined();""",
)
