import crypto from 'crypto';

// EXACT DATA FROM TELEGRAM LOG (Ttaammmo)
// Note: Using the smart quote ’ and escaped slashes \/ exactly as in the log output
const RECEIVED_HASH = '107e6f808cd1ee7546f76daedb7927973a5c4e56077f53941923d3ee4b223631';
const DATA_CHECK_STRING = 'auth_date=1774338778\n' +
  'chat_instance=8060520916662908766\n' +
  'chat_type=sender\n' +
  'user={"id":847634885,"first_name":"It’s","last_name":"","username":"Ttaammmo","language_code":"ru","is_premium":true,"allows_write_to_pm":true,"photo_url":"https:\\/\\/t.me\\/i\\/userpic\\/320\\/1dlRmtWmhGQI4eRc55sP_qPbzT1KqTVqBEZQoXfC4Mk.svg"}';

function testToken(token) {
    const cleaned = token.replace(/[^\x21-\x7E]/g, '').trim();
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(cleaned).digest();
    const h = crypto.createHmac('sha256', secretKey).update(DATA_CHECK_STRING).digest('hex');
    
    console.log(`\nTesting: ${cleaned}`);
    console.log(`Computed : ${h}`);
    console.log(`Expected : ${RECEIVED_HASH}`);
    
    if (h === RECEIVED_HASH) {
        console.log("✅ MATCH FOUND!");
    } else {
        console.log("❌ NO MATCH");
    }
}

const args = process.argv.slice(2);
for (const t of args) {
    testToken(t);
}
