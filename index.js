// Misskey CLI Timeline Viewer (kari)
// https://mi.tsujigoya.net/notes/a98hqg0ojq
// 時々Geminiさんに手伝ってもらっています

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
// import { join } from 'node:path'; -- when you support Windows

const version = '0.1.0'
const path2env = '~/.config/micli/env.json'
const second = 1000 // milliseconds
const cr = `
` // alternative of \n

const usage = `
micli Misskey Timeline Viewer v${version}

Usage: $ micli-tl [options] --name <profile_name>

  -t <timeline_mode>: Select timeline mode (default = home)
    * home: Home Timeline
    * local: Local Timeline
    * global: Global Timeline
    * social: Social (Hybrid) Timeline

  -e <path_to_file>: Specify a path to the environment file 
                     (default = ~/.config/micli/env.json)

  --name <profile_name>: (Required) Specify the account profile name to use

  -h | --help: Show this help

`;

/**
 * env.json設定ファイルから指定のプロファイルを取り出します
 * @param {string} path - 設定ファイルのパス
 * @return {Object} - プロファイル
 */
const readEnv = (path) => {
  const expandedPath = path.replace(/^~(?=$|\/|\\)/, homedir());
  let config;

  try {
    const content = readFileSync(expandedPath, 'utf-8');
    config = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Could not read or parse ${path}`);
    console.error(err.message);
    process.exit(1);
  }
  const profile = config.profiles.find(p => p.name === args.name);

  if (!profile) {
    console.error(`Error: Profile "${args.name}" not found in ${path}`);
    process.exit(1);
  }
  return profile;
}

/**
 * Misskey API への POST リクエスト
 * @param {string} server - サーバーのホスト名
 * @param {string} token - API トークン
 * @param {string} endpoint - API エンドポイント
 * @param {Object} data - 送信するデータ
 * @returns {Promise<Object>} - パースされた JSON レスポンス
 */
const post2mi = async (server, token, endpoint, data = {}) => {
  const url = `https://${server}/api/${endpoint}`;
  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        i: token,
      }),
    });
     
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API Error (${response.status}): ${errorBody}`);
    }
  } catch (err) {
    console.error('Failed to connect to Misskey server:');
    console.error(err.message);
    process.exit(1);
  }
  return await response.json();
};

/**
 * 文字列に色をつける
 * @param {string} str - 処理する文字列
 * @param {string} fg - 前景色 (black, red, green, yellow, blue, magenta, cyan, white)
 * @param {string} bg - 背景色 (同上)
 * @return {string} - ANSIエスケープシーケンスが追加された文字列 (末尾でリセット)
 */
const colorStr = (str, fg, bg = null) => {
  const esc = '\x1b';

  const codes = {
    black: 0, red: 1, green: 2, yellow: 3,
    blue: 4, magenta: 5, cyan: 6, white: 7
  };

  let sequence = '';
  
  if (fg && codes[fg] !== undefined) {
    sequence += `${codes[fg] + 30}`;
  }

  if (bg && codes[bg] !== undefined) {
    if (sequence) sequence += ';';
    sequence += `${codes[bg] + 40}`;
  }

  if (!sequence) return str;

  return `${esc}[${sequence}m${str}${esc}[0m`;
}

// command options
const options = {
  timeline: { type: 'string', short: 't' },
  env: { type: 'string', short: 'e' },
  name: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

const chName = {
  home: 'homeTimeline',
  local: 'localTimeline',
  global: 'globalTimeline',
  social: 'hybridTimeline'
};

// init
const { values: args } = parseArgs({ options });

if (args.name == null) {
  console.log(usage);
  process.exit(1);
} else if (args.help) {
  console.log(usage);
  process.exit(0);
}

const { server, token } = readEnv(args.env || path2env);
const timeline = args.timeline || 'home';

const me = await post2mi(server, token, 'i');
process.stdout.write(colorStr(`Logined as: @${me.username}@${server}${cr}`, 'green'));

var isShowing = false;
const noteQueue = [];
const sessionId = randomUUID();

const openMsg = {
  type: 'connect',
  body: {
    channel: chName[timeline],
    id: sessionId
  }
};

// Terminal
var WIDTH = process.stdout.columns;

process.stdout.on('resize', () => {
  WIDTH = process.stdout.columns;
});

// WebSocket Connection
const socket = new WebSocket(`wss://${server}/streaming?i=${token}`);

socket.addEventListener('open', event => {
  socket.send(JSON.stringify(openMsg));
});

socket.addEventListener('close', event => {
  console.log(colorStr(`${cr}Misskey Stream closed:`, 'red'), event.code, event.reason);
  IS_SIGINT = true;
});

socket.addEventListener('message', event => {
  let res;

  try {
    res = JSON.parse(event.data);
  } catch (err) {
    console.log(`${cr}Failed to parse the JSON message:`, err.message)
  }
  if (res.type == 'channel' && res.body.type == 'note') {
    noteQueue.push(res.body);
  }
});

socket.addEventListener('error', err => {
  console.error(`${cr}Misskey Stream error:`, err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(`${cr}Closing...`);
  socket.close();
  process.exit(0)
});

/**
 * 本文, 添付ファイル, URLをひとつのStringにまとめます
 * @param {Object} note - 受信した投稿をparseしたもの (body以下)
 * @return {string} - 表示する文字列
 */
const listUrls = (note) => {
  const text = note.text == null ? '' 
    : note.text;
  
  const uri = note.url || note.uri || '';
  
  let result = text;
  
  if (note.files && note.files.length > 0) {
    const files = note.files.map(f => colorStr(f.url, 'blue')).join(cr);
    result += (result ? cr : '') + files;
  }  
  if (uri) {
    result += (result ? cr : '') + colorStr(uri, 'blue');
  }
  
  return result;
}

/**
 * 投稿を1文字ずつ表示します
 * @param {number} ptr - `text`のうち、表示する文字の位置
 * @param {string} text - 主にlistUrls()で処理した投稿の内容
 */
const showPerOne = (ptr, text) => {
  process.stdout.write(text.charAt(ptr));
   
  if (text.length <= ptr + 1) {
    noteQueue.shift();
    isShowing = false;
    process.stdout.write(cr);
  } else {
    setTimeout(() => {showPerOne(ptr + 1, text)}, 0.03 * second);
  }
}

const isRepostOnly = (note) => (note.renote != null) && (note.text == null);

const showNote = () => {
  isShowing = true;
  const note = noteQueue[0].body;
  
  let text = '';
  let label = colorStr('FROM:', 'yellow');

  if (isRepostOnly(note)) {
    text = colorStr('--- Renoted below ---', 'magenta');
  } else {
    text = listUrls(note);
  }
 
  // 割り込みロジック: リノートがあれば次に回す
  if (note.renote != null) {
    noteQueue.splice(1, 0, {body: note.renote});
  }
  
  const name = colorStr(`@${note.user.username}@${note.user.host || server}`, 'cyan');
  process.stdout.write(`${cr}${label} ${name}${cr}`);
  
  if (text === '') {
    noteQueue.shift();
    isShowing = false;
  } else {
    showPerOne(0, text); 
  }
}

const waitLoop = () => {
  if (noteQueue.length > 0 && !isShowing) {
    showNote();
  }
  setTimeout(waitLoop, 0.5 * second);
}

waitLoop();



