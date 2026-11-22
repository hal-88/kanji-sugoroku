// 問題の読みこみ・答えの判定
import { KANJI_QUESTIONS } from '../data/questions.js';
import { toHiragana } from 'wanakana';

import { rand } from './rng.js';
export const QUESTIONS = {};
for (const g of [4, 5, 6]) {
  QUESTIONS[g] = KANJI_QUESTIONS[g].split(/[,\n]/).map(s => s.trim()).filter(Boolean)
    .map(s => { const [kanji, yomi] = s.split(/\s+/); return { kanji, yomi }; });
}

// 子どもの入力ゆれをならす（小さい字＝大きい字、カタカナ＝ひらがな、ローマ字もOK）
const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'っ': 'つ', 'ゎ': 'わ' };
export function normalize(input) {
  let s = String(input).normalize('NFKC').toLowerCase().trim();
  if (/[a-z]/.test(s)) s = toHiragana(s, { convertLongVowelMark: false });
  s = s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  s = s.replace(/([あいうえお])ー/g, '$1$1');
  s = s.replace(/[ぁぃぅぇぉゃゅょっゎ]/g, m => SMALL[m]);
  s = s.replace(/[\s、。．・･,.]/g, '');
  return s;
}
export const hasKanji = s => /[㐀-鿿々〆]/.test(s);
export const isCorrect = (input, q) => normalize(input) === normalize(q.yomi);

// 同じ問題がなるべく出ないように、まぜた順にとり出す
export function makeBag(grade) {
  let order = [];
  return {
    next() {
      if (!order.length) {
        order = QUESTIONS[grade].map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      }
      return QUESTIONS[grade][order.pop()];
    },
  };
}

// 正解したときのポイント（2文字10・3文字以上15・早答え+5）
export function pointsFor(q, timeLeft, limit) {
  const base = Array.from(q.kanji).length >= 3 ? 15 : 10;
  const fast = limit > 0 && timeLeft >= limit / 2 ? 5 : 0;
  return { base, fast, total: base + fast };
}
