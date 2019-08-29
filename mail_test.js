

const Mail = require('./mail.js')

let sent = Mail.sendMail('oleg@gmail.com', 'test_token_1234567')

console.log(sent);
