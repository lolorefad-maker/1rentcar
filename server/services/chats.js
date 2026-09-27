/** Saved concierge conversations, so no website enquiry is lost. */
import { notFound } from '../lib/http.js';

const MAX_PREVIEW = 140;
const SESSION_KEY_RE = /^[A-Za-z0-9_-]{6,64}$/;

export const serializeChat = (row) => ({ ...row, isRead: row.isRead === 1 });

/** Transcripts are written after the reply is sent, so two quick messages can race here. */
async function openChat(db, sessionKey, lang) {
  await db.run('INSERT OR IGNORE INTO chats (sessionKey, lang) VALUES (?, ?)', [sessionKey, lang]);
  return db.get('SELECT * FROM chats WHERE sessionKey = ?', [sessionKey]);
}

/** Stores one question and its answer. Invalid session keys are ignored, never fatal. */
export async function recordExchange(db, { sessionKey, lang, question, answer }) {
  if (!SESSION_KEY_RE.test(sessionKey ?? '')) return null;
  const chat = await openChat(db, sessionKey, lang);
  await db.run('INSERT INTO chat_messages (chatId, role, text) VALUES (?, ?, ?)', [chat.id, 'user', question]);
  await db.run('INSERT INTO chat_messages (chatId, role, text) VALUES (?, ?, ?)', [chat.id, 'bot', answer]);
  await db.run(
    `UPDATE chats SET messageCount = messageCount + 2, lastMessage = ?, lang = ?, isRead = 0,
     updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    [question.slice(0, MAX_PREVIEW), lang, chat.id],
  );
  return chat.id;
}

export function listChats(db) {
  return db.all('SELECT * FROM chats ORDER BY updatedAt DESC LIMIT 500');
}

export async function getChat(db, id) {
  const chat = await db.get('SELECT * FROM chats WHERE id = ?', [id]);
  if (!chat) throw notFound('Chat');
  const messages = await db.all('SELECT role, text, createdAt FROM chat_messages WHERE chatId = ? ORDER BY id', [id]);
  return { chat: serializeChat(chat), messages };
}

export async function setChatRead(db, id, isRead) {
  const { chat } = await getChat(db, id);
  await db.run('UPDATE chats SET isRead = ? WHERE id = ?', [isRead ? 1 : 0, chat.id]);
  return (await getChat(db, id)).chat;
}

export async function deleteChat(db, id) {
  await getChat(db, id);
  await db.run('DELETE FROM chats WHERE id = ?', [id]);
}

export async function unreadChatCount(db) {
  const { count } = await db.get('SELECT COUNT(*) AS count FROM chats WHERE isRead = 0');
  return count;
}
