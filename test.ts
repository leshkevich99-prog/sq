import { firestore } from './server/db.js';
import { v4 as uuidv4 } from 'uuid';

async function test() {
  const oldUserIdStr = '8227472600';
  const newId = uuidv4();

  // Create "Old User"
  await firestore.collection('users').set(oldUserIdStr, { role: 'client', telegramId: oldUserIdStr });
  
  // Create "New User"
  await firestore.collection('users').set(newId, { role: 'client', telegramId: '999999999' });

  // Add transaction to both
  await firestore.collection('transactions').set(uuidv4(), { userId: oldUserIdStr, amount: 500 });
  await firestore.collection('transactions').set(uuidv4(), { userId: newId, amount: 500 });

  // Read transactions
  const oldTxs = await firestore.collection('transactions').all([{ type: 'where', field: 'userId', op: '==', value: oldUserIdStr }]);
  const newTxs = await firestore.collection('transactions').all([{ type: 'where', field: 'userId', op: '==', value: newId }]);

  console.log(`Old user tx count: ${oldTxs.length}`);
  console.log(`New user tx count: ${newTxs.length}`);
}

test().then(() => process.exit(0)).catch(console.error);
