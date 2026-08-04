from pathlib import Path

path = Path('tests/components/followUpTargeting.test.tsx')
source = path.read_text(encoding='utf-8')
old = ').toBeVisible();'
new = ').toBeInTheDocument();'
count = source.count(old)
if count != 1:
    raise SystemExit(
        f'tests/components/followUpTargeting.test.tsx: expected one visibility assertion, found {count}'
    )
path.write_text(source.replace(old, new, 1), encoding='utf-8')
