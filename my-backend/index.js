const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FB_TYPE,
    project_id: process.env.FB_PROJECT_ID,
    private_key_id: process.env.FB_PRIVATE_KEY_ID,
    private_key: process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FB_CLIENT_EMAIL,
    client_id: process.env.FB_CLIENT_ID,
    auth_uri: process.env.FB_AUTH_URI,
    token_uri: process.env.FB_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FB_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FB_CLIENT_CERT_URL,
  }),
});

const db = admin.firestore();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();

app.use(express.json());

// **ตัดการ serve static และ route index.html ออกทั้งหมด**

app.post('/webhook', middleware(config), async (req, res) => {
  const events = req.body.events;
  try {
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const userId = event.source.userId;
    const messageText = event.message.text;

    console.log('userId:', userId);
    console.log('message:', messageText);

    const userRef = db.collection('users').doc(userId);
    await userRef.set(
      {
        lastMessage: messageText,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขอบคุณสำหรับข้อความครับ!',
    });
  }
  return Promise.resolve(null);
}

app.post('/notify', async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ success: false, error: 'Missing userId or message' });
  }

  try {
    await client.pushMessage(userId, {
      type: 'text',
      text: message,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
