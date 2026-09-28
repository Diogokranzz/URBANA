const http = require('http');
const crypto = require('crypto');
const key = crypto.randomBytes(16).toString('base64');
const req = http.request({
  host: '127.0.0.1', port: 8137, path: '/ws',
  headers: {
    Connection: 'Upgrade', Upgrade: 'websocket',
    'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
    Origin: 'http://127.0.0.1:8137',
  },
});
req.end();
let sock = null, buf = Buffer.alloc(0);
req.on('upgrade', (res, s) => {
  sock = s;
  const send = obj => {
    const pl = Buffer.from(JSON.stringify(obj));
    const mask = crypto.randomBytes(4);
    const head = pl.length < 126 ? Buffer.from([0x81, 0x80 | pl.length]) : Buffer.from([0x81, 0x80 | 126, 0, pl.length]);
    sock.write(Buffer.concat([head, mask, Buffer.from(pl.map((b, i) => b ^ mask[i & 3]))]));
  };
  s.on('data', c => {
    buf = Buffer.concat([buf, c]);
    while (buf.length >= 2) {
      let len = buf[1] & 0x7f, pos = 2;
      if (len === 126) { len = buf.readUInt16BE(2); pos = 4; }
      if (buf.length < pos + len) break;
      const m = JSON.parse(buf.slice(pos, pos + len).toString('utf8'));
      buf = buf.slice(pos + len);
      if (m.t === 'welcome') {
        console.log('DELTA entrou, id', m.you.id);
        let x = 8, t = 0;
        const iv = setInterval(() => {
          t += 0.1; x = 8 + Math.sin(t) * 4;
          send({ t: 'state', p: [+x.toFixed(2), 0, 6], yaw: +(Math.sin(t) * 2).toFixed(2), pitch: 0, slot: 0, hp: 100, m: 1 });
          if (t > 5.5) {
            clearInterval(iv);
            send({ t: 'chat', m: 'cobrindo o cruzamento!' });
            setTimeout(() => { s.destroy(); process.exit(0); }, 300);
          }
        }, 100);
      }
    }
  });
  send({ t: 'hello', name: 'DELTA', cls: 'thug' });
});
setTimeout(() => process.exit(0), 9000);
