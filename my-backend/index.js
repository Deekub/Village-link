const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Firebase Admin SDK init
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();

app.use(express.json());

// Serve static files from Expo web build
app.use(express.static(path.join(__dirname, 'web-build')));

// For any other route, serve the React app index.html
app.get('*', (req, res, next) => {
  // ถ้า path เริ่มด้วย /api หรือ /webhook ให้ข้ามไปเลย (ไม่ส่ง index.html)
  if (req.path.startsWith('/api') || req.path === '/webhook' || req.path === '/notify') {
    return next();
  }
  res.sendFile(path.join(__dirname, 'web-build', 'index.html'));
});

// Webhook endpoint รับ event จาก LINE
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

// ฟังก์ชันจัดการ event
async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const userId = event.source.userId;
    const messageText = event.message.text;

    console.log('userId:', userId);
    console.log('message:', messageText);

    // เก็บ userId ลง Firestore (เก็บครั้งเดียว หรืออัพเดตข้อความล่าสุด)
    const userRef = db.collection('users').doc(userId);
    await userRef.set(
      {
        lastMessage: messageText,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ตอบกลับผู้ใช้ (optional)
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขอบคุณสำหรับข้อความครับ!',
    });
  }
  return Promise.resolve(null);
}

// API endpoint สำหรับยิงข้อความไปหา user โดยใช้ userId
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
