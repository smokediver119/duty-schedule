"""Merge 내선번호(ext) into users.json seed."""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

users = json.loads(Path("seed/users.json").read_text(encoding="utf-8"))
phones = json.loads(Path("seed/phones.json").read_text(encoding="utf-8"))

ext_map = {p["name"]: p["ext"] for p in phones}

matched = 0
missing = []
for u in users:
    ext = ext_map.get(u["name"])
    if ext:
        u["ext"] = ext
        matched += 1
    else:
        u["ext"] = None
        missing.append(u["name"])

Path("seed/users.json").write_text(
    json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8"
)
Path("public/seed/users.json").write_text(
    json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8"
)

print(f"✅ matched {matched}/{len(users)}")
print(f"❌ missing ext ({len(missing)}): {missing}")
