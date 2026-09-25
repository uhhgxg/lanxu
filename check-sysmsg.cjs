const Database = require('better-sqlite3');
const db = new Database('D:/My-Day/mini/miniclaw-main/data/db/messages.db', { readonly: true });
const rows = db.prepare(
  "SELECT id, sender, sender_name, substr(content,1,100) as content, timestamp FROM messages WHERE sender = '__system__' ORDER BY timestamp DESC LIMIT 10"
).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
