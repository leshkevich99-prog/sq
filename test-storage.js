import https from 'https';

const req = https.request('https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0402816336.appspot.com/o?name=test.jpg', {
  method: 'POST',
  headers: {
    'Content-Type': 'image/jpeg'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.write('test');
req.end();
