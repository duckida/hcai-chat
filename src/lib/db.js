const DB_NAME = "hcai-chat";
const DB_VERSION = 1;
const STORE_NAME = "conversations";

/**
 * A single connection is reused for every read and write. The previous
 * implementation opened a fresh connection per call, which meant each streamed
 * message patch paid for an open handshake. The browser can revoke the
 * connection underneath us, so the cache is dropped the moment it says so and
 * the next call reconnects transparently.
 */
let connection = null;
let opening = null;

function dropConnection(db) {
  if (connection === db) connection = null;
  try {
    db.close();
  } catch {}
}

function openDB() {
  if (connection) return Promise.resolve(connection);
  if (opening) return opening;

  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => dropConnection(db);
      db.onclose = () => dropConnection(db);
      connection = db;
      opening = null;
      resolve(db);
    };

    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });

  return opening;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Run `work` against the object store inside one transaction and resolve when
 * that transaction commits. `work` runs synchronously so the requests it
 * issues belong to the transaction; whatever promise it returns is awaited
 * before the caller sees the result.
 */
function withStore(mode, work) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx;
        let result;
        try {
          tx = db.transaction(STORE_NAME, mode);
          result = work(tx.objectStore(STORE_NAME));
        } catch (error) {
          // A transaction that cannot even be created means the cached
          // connection went stale — drop it so the next call reconnects.
          dropConnection(db);
          reject(error);
          return;
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      }),
  );
}

export async function getAllConversations() {
  const results = await withStore("readonly", (store) =>
    requestAsPromise(store.getAll()),
  );
  const conversations = results || [];
  conversations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return conversations;
}

export async function saveAllConversations(conversations) {
  await withStore("readwrite", (store) => {
    store.clear();
    for (const conversation of conversations) {
      store.put(conversation);
    }
  });
}

export async function putConversation(conversation) {
  await withStore("readwrite", (store) => {
    store.put(conversation);
  });
}

export async function deleteConversation(id) {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}
