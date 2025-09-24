import os, json, datetime, argparse

def as_int(v):
    try: return int(v)
    except: return 0

def clean_move(m):
    if isinstance(m, dict):
        return {"walk": as_int(m.get("walk", 0)), "jump": as_int(m.get("jump", 0))}
    return {"walk": 0, "jump": 0}

def main(manifest_path):
    manifest_path = os.path.normpath(manifest_path)
    base_dir = os.path.dirname(manifest_path)  # ...\data
    backup   = os.path.join(base_dir, "manifest.backup.json")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    items = manifest.get("items", [])
    updated, missing, errors = 0, [], []

    for it in items:
        rel_path = it.get("path") or (f"{it.get('bucket','')}/{it.get('file','')}".strip("/"))
        if not rel_path:
            missing.append({"reason":"no path", "item": it.get("displayName") or it.get("model")})
            continue

        mech_path = os.path.join(base_dir, rel_path)
        if not os.path.isfile(mech_path):
            missing.append({"reason":"file not found", "path": rel_path})
            continue

        try:
            with open(mech_path, "r", encoding="utf-8") as mf:
                mech = json.load(mf)
        except Exception as e:
            errors.append({"path": rel_path, "err": str(e)})
            continue

        # ALWAYS overwrite from mech.json
        it["movement"] = clean_move(mech.get("movement", {}))
        it["source"]   = mech.get("source", "")
        it["role"]     = mech.get("role", "")
        updated += 1

    manifest["generated"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    with open(backup, "w", encoding="utf-8") as bf:
        json.dump(manifest, bf, indent=2)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"✅ Updated: {updated}")
    print(f"⚠️ Missing files: {len(missing)} | JSON errors: {len(errors)}")
    if missing[:3]: print("Missing (first 3):", missing[:3])
    if errors[:3]:  print("Errors  (first 3):", errors[:3])

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-m","--manifest", required=True, help="Full path to data\\manifest.json")
    args = ap.parse_args()
    main(args.manifest)
