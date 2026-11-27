#!/usr/bin/env python3
"""
CouchDB 体检 / 抢救工具（DaysNote）

用途：
  1) --check   只读盘点：库里有几篇正常文档、几篇被标记删除、正常事件都是哪些
  2) --rescue  尝试把「被标记 _deleted」的文档用旧修订内容复活（压缩前有效）

背景：
  v28 曾把「本地清理旧内置事件」误做成「连云端一起删」，用 _bulk_docs 发送
  {_id, _rev, _deleted: true}。CouchDB 里被删文档的旧修订在 compaction 之前
  仍可通过 ?rev=<旧rev> 读到，因此还有抢救窗口。

用法：
  python3 scripts/couch_inspect.py --check --url https://35.212.181.94:5984 --db daysnote --user 用户名 --password 密码
  python3 scripts/couch_inspect.py --rescue --dry --url ... (先看能救回几条)
  python3 scripts/couch_inspect.py --rescue --apply --url ... (真写回)

安全：默认只读；--apply 才会写入，且只对「已确认被删且能取回旧内容」的文档操作。
"""
import argparse
import json
import sys
import urllib3
import requests

urllib3.disable_warnings()

def build(args):
    return requests.Session(), {
        'auth': (args.user, args.password) if args.user else None,
        'verify': args.verify,
        'timeout': 30,
    }

def api(sess, base, path, **kw):
    url = f"{base}/{path}"
    r = sess.get(url, **kw)
    return r

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True, help='例如 https://35.212.181.94:5984')
    ap.add_argument('--db', default='daysnote')
    ap.add_argument('--user', default='')
    ap.add_argument('--password', default='')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--rescue', action='store_true')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--verify', action='store_true', help='校验 HTTPS 证书（自签证书默认不校验）')
    args = ap.parse_args()

    sess, kw = build(args)
    base = args.url.rstrip('/') + '/' + requests.utils.quote(args.db, safe='')

    # ---------- 库信息 ----------
    r = sess.get(base, **kw)
    if r.status_code == 401:
        print('❌ 认证失败（401）。请确认用户名 / 密码，或该库是否允许匿名访问。')
        return 2
    if r.status_code == 404:
        print(f'❌ 数据库 {args.db} 不存在（404）')
        return 2
    r.raise_for_status()
    info = r.json()
    print('=== 库信息 ===')
    print(f"库名        : {info.get('db_name')}")
    print(f"文档数      : {info.get('doc_count')}（含已删除标记的文档）")
    print(f"已删文档数  : {info.get('doc_del_count')}")
    print(f"体积(active): {info.get('sizes', {}).get('active')} B / 磁盘 {info.get('sizes', {}).get('disk')} B")

    # ---------- 正常文档 ----------
    r = sess.get(f"{base}/_all_docs", params={'include_docs': 'true'}, **kw)
    r.raise_for_status()
    rows = r.json().get('rows', [])
    alive = [(x['id'], x.get('doc') or {}) for x in rows if x.get('doc') and not x.get('doc', {}).get('_deleted')]
    events = [(i, d) for i, d in alive if i.startswith('event:')]
    cats = [(i, d) for i, d in alive if i.startswith('category:')]
    others = [(i, d) for i, d in alive if not i.startswith('event:') and not i.startswith('category:')]
    print('\n=== 正常文档 ===')
    print(f"事件 {len(events)} 条 / 分类 {len(cats)} 个 / 其他 {len(others)} 篇")
    for i, d in events[:50]:
        print(f"  {i:<32} {d.get('title', '(无标题)'):<16} {d.get('date', '')}  {d.get('icon', '')}")
    if others:
        print('  --- 无前缀 _id 的文档（同步时曾被丢弃的类型）---')
        for i, d in others[:30]:
            print(f"  {i:<32} keys={list(d.keys())[:6]}")

    # ---------- 已删除文档 ----------
    r = sess.get(f"{base}/_changes", params={'since': '0', 'style': 'all_docs'}, **kw)
    r.raise_for_status()
    changes = r.json().get('results', [])
    deleted = {}
    for c in changes:
        if c.get('deleted'):
            revs = [x.get('rev') for x in c.get('changes', []) if x.get('rev')]
            deleted[c['id']] = revs
    print('\n=== 已删除文档 ===')
    print(f"共 {len(deleted)} 篇：{list(deleted)[:20]}{' ...' if len(deleted) > 20 else ''}")

    if args.check and not args.rescue and not args.apply:
        if deleted:
            print('\n提示：以上文档被标记删除，可用 --rescue --dry 检查还能否取回旧内容。')
        return 0

    if not (args.rescue or args.apply):
        return 0

    # ---------- 尝试恢复（实测有效：修订链回捞 + new_edits=false 分支写入） ----------
    recovered = []
    for doc_id, leaf in deleted.items():
        enc = requests.utils.quote(doc_id, safe='')
        r = sess.get(f"{base}/{enc}", params={'rev': leaf, 'revs': 'true'}, **kw)
        if r.status_code != 200:
            print(f"✗ {doc_id}: 取修订链失败 {r.status_code}")
            continue
        meta = r.json()
        revs = meta.get('_revisions')
        if not revs:
            print(f"✗ {doc_id}: 无 _revisions（可能已压缩）")
            continue
        start = revs['start']
        found = None
        for n in range(start - 1, max(start - 30, 0), -1):
            rr = sess.get(f"{base}/{enc}", params={'rev': f"{n}-{revs['ids'][start - n]}", 'revs': 'true'}, **kw)
            if rr.status_code != 200:
                break
            if not rr.json().get('_deleted'):
                found = rr.json()
                break
        if not found:
            print(f"✗ {doc_id}: 30 代内无未删除版本")
            continue
        body = {k: v for k, v in found.items() if not k.startswith('_')}
        parent = found['_revisions']
        import hashlib
        newhash = hashlib.md5(json.dumps(body, sort_keys=True).encode() + doc_id.encode()).hexdigest()
        recovered.append({
            '_id': doc_id,
            '_rev': f"{parent['start'] + 1}-{newhash}",
            '_revisions': {'start': parent['start'] + 1, 'ids': [newhash] + parent['ids']},
            **body,
        })
        print(f"✓ {doc_id:<30} {body.get('title', body.get('name', '?'))}")

    print(f"\n可恢复 {len(recovered)} / {len(deleted)}")
    if args.dry or not args.apply:
        print('[dry] 未写入。确认后加 --apply 执行（以 new_edits=false 写入非删除分支）。')
        return 0

    r = requests.post(f"{base}/_bulk_docs", json={'docs': recovered, 'new_edits': False}, **kw)
    res = r.json() if r.status_code == 201 else []
    bad = [x for x in res if not x.get('ok')]
    print(f"写回成功 {len(recovered) - len(bad)} / 失败 {len(bad)}")
    for x in bad[:10]:
        print(' ', x)
    return 0
