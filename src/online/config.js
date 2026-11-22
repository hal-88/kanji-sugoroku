// オンライン対戦の設定
//
// Firebase の設定。Firebase コンソールの「プロジェクトの設定 → マイアプリ」に出る firebaseConfig を
// ここに貼る。null のあいだは「テストモード」（同じパソコンの 別のタブどうしだけで 対戦できる）。
// ※ この値は パスワードではなく、公開して使うもの。安全は database.rules.json のルールで守る。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCnaSPbMPaflYHbwEyNSKv_fvtQcqNjGJQ',
  authDomain: 'kanji-sugoroku.firebaseapp.com',
  databaseURL: 'https://kanji-sugoroku-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kanji-sugoroku',
  storageBucket: 'kanji-sugoroku.firebasestorage.app',
  messagingSenderId: '131814897211',
  appId: '1:131814897211:web:a0982564975a5d61480e1e',
};

export const ONLINE = {
  maxPlayers: 4,
  nameMaxLength: 6,
  goneMs: 800,         // 「やめる」で ぬけた人の 番が きたら、これだけ 待って CPU に かえる
  offlineMs: 20000,    // 通信が 切れたままの 人の 番が きたら、これだけ 待って CPU に かえる
  roomExpireHours: 6,  // これより 古い部屋は、同じ ばんごうで 作りなおせる
};
