import { firestore } from './server/db.js';

async function check() {
  const txs = await firestore.collection('transactions').all();
  console.log('Total txs:', txs.length);
  const userTxs = txs.filter((t: any) => t.userId === '706ede6c-363b-491d-ae8f-ce3b067570aa');
  console.log('User txs:', userTxs.length);
  if (userTxs.length > 0) {
    console.log(JSON.stringify(userTxs, null, 2));
  }
}

check().then(() => process.exit(0)).catch(console.error);
