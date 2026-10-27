const databaseName = "english-skill-lab-speaking-audio";
const storeName = "recordings";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function inStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let value: T;
    transaction.oncomplete = () => { database.close(); resolve(value); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    action(transaction.objectStore(storeName), (next) => { value = next; }, reject);
  });
}

export const localRecordingKey = (sessionId: string, answerIndex: number) => `${sessionId}/${answerIndex}`;

export function putLocalRecording(sessionId: string, answerIndex: number, blob: Blob): Promise<void> {
  return inStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(blob, localRecordingKey(sessionId, answerIndex));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getLocalRecording(sessionId: string, answerIndex: number): Promise<Blob | undefined> {
  return inStore<Blob | undefined>("readonly", (store, resolve, reject) => {
    const request = store.get(localRecordingKey(sessionId, answerIndex));
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}

export function listLocalRecordingIndexes(sessionId: string): Promise<number[]> {
  return inStore<number[]>("readonly", (store, resolve, reject) => {
    const request = store.getAllKeys(IDBKeyRange.bound(`${sessionId}/`, `${sessionId}/\uffff`));
    request.onsuccess = () => resolve((request.result as string[]).map((key) => Number(key.split("/")[1])).filter(Number.isInteger));
    request.onerror = () => reject(request.error);
  });
}

export function deleteLocalRecordings(sessionId: string): Promise<void> {
  return inStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.openKeyCursor(IDBKeyRange.bound(`${sessionId}/`, `${sessionId}/\uffff`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
      else resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
