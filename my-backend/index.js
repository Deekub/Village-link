const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');
const cron = require('node-cron');
const cors = require('cors');
const { Timestamp } = require('firebase-admin/firestore');

dotenv.config();

// === Initialize Firebase Admin SDK ===
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

// === LINE Bot Config ===
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// === Middleware ===
app.use(cors());
app.use(bodyParser.json());

// === Routes ===
app.get('/', (req, res) => {
  res.send('👋 Hello from Node.js + Firebase + LINE API Server!');
});

// API สำหรับ frontend เรียกส่งข้อความ LINE ทันที
app.post('/notify', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const usersSnapshot = await db.collection('lineUsers').get();
    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'No LINE users found' });
    }

    const pushPromises = [];
    usersSnapshot.forEach(userDoc => {
      pushPromises.push(client.pushMessage(userDoc.id, {
        type: 'text',
        text: message,
      }));
    });

    await Promise.all(pushPromises);

    res.json({ message: `Sent to ${usersSnapshot.size} users.` });
  } catch (error) {
    console.error('Error sending LINE messages:', error);
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

// === Cron Job: Run every 15 minutes ===
cron.schedule('*/15 * * * *', async () => {
  console.log('🔄 Running scheduled broadcast task');

  try {
    const now = new Date();

    // ดึงข่าวที่ยังไม่ส่งและเวลาที่ต้องแจ้ง <= ตอนนี้
    const newsSnapshot = await db.collection('news')
      .where('sent', '==', false)
      .where('notifyTime', '<=', Timestamp.fromDate(now))
      .get();

    if (newsSnapshot.empty) {
      console.log('✅ No news to broadcast.');
      return;
    }

    // ดึงผู้ใช้ LINE
    const usersSnapshot = await db.collection('lineUsers').get();
    if (usersSnapshot.empty) {
      console.warn('⚠️ No LINE users found.');
      return;
    }

    for (const doc of newsSnapshot.docs) {
      const data = doc.data();

      const message = `📢 แจ้งข่าวจาก ${data.village}
หัวข้อ: ${data.topic}
การจัดการ: ${data.action}
รายละเอียด: ${data.detail}
เวลา: ${data.notifyTime.toDate().toLocaleString()}
เวลาจัดการโดยประมาณ: ${data.fixTime}`;

      const pushPromises = [];
      usersSnapshot.forEach(userDoc => {
        pushPromises.push(client.pushMessage(userDoc.id, {
          type: 'text',
          text: message,
        }));
      });

      await Promise.all(pushPromises);
      console.log(`📬 ส่งข่าวให้ผู้ใช้ ${usersSnapshot.size} คน`);

      // คำนวณเวลารอบถัดไป (ถ้ามี repeatCount)
      // frequency ควรเป็นรูปแบบ "ทุก X ชั่วโมง Y นาที"
      const freqMatch = data.frequency.match(/(\d+)/g);
      if (freqMatch && freqMatch.length >= 2) {
        const h = parseInt(freqMatch[0], 10);
        const m = parseInt(freqMatch[1], 10);
        const nextTime = data.notifyTime.toDate();
        nextTime.setHours(nextTime.getHours() + h);
        nextTime.setMinutes(nextTime.getMinutes() + m);

        if (data.repeatCount > 1) {
          await doc.ref.update({
            notifyTime: Timestamp.fromDate(nextTime),
            repeatCount: data.repeatCount - 1,
          });
          console.log(`🔁 เตรียมรอบถัดไปอีก ${data.repeatCount - 1} ครั้ง`);
        } else {
          await doc.ref.update({ sent: true });
          console.log(`✅ รอบสุดท้ายแล้ว ปิดการส่ง`);
        }
      } else {
        // frequency ไม่ถูกต้องหรือไม่มี
        await doc.ref.update({ sent: true });
        console.log(`❌ frequency ไม่ถูกต้อง ปิดการส่ง`);
      }
    }
  } catch (err) {
    console.error('❌ Error in cron job:', err);
  }
});

// === Start Server ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
