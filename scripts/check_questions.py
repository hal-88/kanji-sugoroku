# 問題データの点検：python scripts/check_questions.py src/data/questions.js
# （学年より上の漢字・その学年の漢字がない・重なり・まだ出てこない漢字 を出す）
import sys, re, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grades import G, GRADE_OF

def load(path):
    s = open(path, encoding='utf-8').read()
    out = {}
    for g in '456':
        m = re.search(g + r':\s*`([^`]*)`', s)
        out[int(g)] = [tuple(x.strip().split()) for x in re.split(r'[,、\n]', m.group(1)) if x.strip()]
    return out

def is_kanji(c):
    return '一' <= c <= '鿿'   # 々 は 漢字の 数に 入れない

def analyze(Q, show_ok=False):
    seen = {}
    for g in (4, 5, 6):
        bad_hi, no_g, dup, odd = [], [], [], []
        for item in Q[g]:
            if len(item) != 2:
                odd.append(item); continue
            w, y = item
            ks = [c for c in w if is_kanji(c)]
            over = [c for c in ks if GRADE_OF.get(c, 99) > g]
            if over:
                bad_hi.append(f"{w}({''.join(c + str(GRADE_OF.get(c, '中')) for c in over)})")
            if not any(GRADE_OF.get(c) == g for c in ks):
                no_g.append(f"{w}({''.join(str(GRADE_OF.get(c, '中')) for c in ks)})")
            if w in seen:
                dup.append(f"{w}({seen[w]}年と)")
            seen.setdefault(w, g)
            if not re.fullmatch(r'[ぁ-ゖー]+', y):
                odd.append(item)
        cover = set(c for w, *_ in Q[g] for c in w if GRADE_OF.get(c) == g)
        missing = [c for c in G[g] if c not in cover]
        print(f'===== {g}年 {len(Q[g])}問')
        print('  学年より上・中学の漢字:', len(bad_hi), ' '.join(bad_hi))
        print(f'  {g}年の漢字が入っていない:', len(no_g), ' '.join(no_g))
        print('  重なり:', len(dup), ' '.join(dup))
        print('  形がへん:', odd)
        print(f'  {g}年の漢字で まだ出てこない:', len(missing), ''.join(missing))

if __name__ == '__main__':
    analyze(load(sys.argv[1]))
