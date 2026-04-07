/**
 * Persistent conversation storage using IndexedDB.
 * @module db
 */

import { openDB } from 'idb';

const DB_NAME = 'klanker';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

/**
 * Opens (or creates) the database.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    },
  });
}

/**
 * Loads all conversations, sorted by updatedAt descending.
 * @returns {Promise<Array>}
 */
export async function loadConversations() {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}

/**
 * Saves a single conversation (insert or update).
 * @param {object} conversation
 * @returns {Promise<void>}
 */
export async function saveConversation(conversation) {
  const db = await getDb();
  await db.put(STORE_NAME, JSON.parse(JSON.stringify(conversation)));
}

/**
 * Deletes a conversation by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteConversation(id) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}
