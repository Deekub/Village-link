const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');
const cron = require('node-cron');
const cors = require('cors');
const { Timestamp } = require('firebase-admin/firestore');
const axios = require('axios'); // <-- เพิ่มบรรทัดนี้

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

console.log('🔐 LINE_CHANNEL_SECRET:', process.env.LINE_CHANNEL_SECRET);

// === Thaibulksms API Config === <-- เพิ่มส่วนนี้
const THAI_BULK_SMS_API_URL = 'https://api.thaibulksms.com/sms/v2/send';
const THAI_BULK_SMS_API_KEY = process.env.THAI_BULK_SMS_API_KEY;
const THAI_BULK_SMS_API_SECRET = process.env.THAI_BULK_SMS_API_SECRET;
const THAI_BULK_SMS_SENDER_NAME = process.env.THAI_BULK_SMS_SENDER_NAME;

// ตรวจสอบว่า API Keys ถูกตั้งค่าหรือไม่
if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET) {
  console.error("🚨 THAI_BULK_SMS_API_KEY and THAI_BULK_SMS_API_SECRET are not set in .env");
  // process.exit(1); // อาจจะหยุดแอปถ้าจำเป็นต้องใช้ SMS API เสมอ
}

// === Middleware ===
app.use(cors({
  origin: ['http://localhost:8081'], // หรือใส่ array หลาย origin ได้
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// === Routes ===
app.get('/', (req, res) => {
  res.send('👋 Hello from Node.js + Firebase + LINE API Server!');
});

// สำหรับ /notify route ใช้ bodyParser.json() แยกเฉพาะ route นี้
app.post('/notify', bodyParser.json(), async (req, res) => {
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

// webhook route: line.middleware(config) ต้องอยู่ก่อนเสมอ
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const userId = event.source.userId;
    const text = event.message.text;

    // บันทึกข้อความ incoming พร้อม unread: true
    await db.collection('lineUsers').doc(userId)
      .collection('messages').add({
        direction: 'in', // ข้อความเข้ามา
        message: text,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        unread: true,  // <-- เพิ่มบรรทัดนี้
      });
  } else if (event.type === 'follow') {
    const userId = event.source.userId;

    try {
      const userRef = db.collection('lineUsers').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({
          followedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ บันทึกผู้ใช้ใหม่: ${userId}`);
      }

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ขอบคุณที่ติดตาม Village Link ของเราครับ!',
      });
    } catch (error) {
      console.error('❌ Error saving new user:', error);
      return null;
    }
  }

  // กรณี event อื่นๆ ไม่ได้สนใจ
  return Promise.resolve(null);
}

// === ฟังก์ชันสำหรับส่ง SMS ผ่าน Thaibulksms API === <-- เพิ่มฟังก์ชันนี้
async function sendSmsViaThaiBulkSms(phoneNumber, message) {
  if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET) {
    console.warn("⚠️ SMS API credentials not set. Skipping SMS send.");
    return { success: false, error: "SMS API credentials not set" };
  }

  try {
    const response = await axios.post(THAI_BULK_SMS_API_URL, null, {
      params: {
        key: THAI_BULK_SMS_API_KEY,
        secret: THAI_BULK_SMS_API_SECRET,
        msisdn: phoneNumber,
        message: message,
        sender: THAI_BULK_SMS_SENDER_NAME,
        // force: 'corporate', // ถ้าต้องการใช้ Corporate SMS ให้เปิดบรรทัดนี้
      }
    });

    // Thaibulksms API มักจะตอบกลับเป็น JSON ที่มี status/code
    if (response.data.status === 'success') {
      console.log(`✅ SMS sent successfully to ${phoneNumber}:`, response.data);
      return { success: true, data: response.data };
    } else {
      console.error(`❌ Failed to send SMS to ${phoneNumber}:`, response.data.status, response.data.message);
      return { success: false, error: response.data.message || 'Unknown error', code: response.data.status };
    }
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber} via API:`, error.message);
    if (error.response) {
      console.error("  Response data:", error.response.data);
      console.error("  Response status:", error.response.status);
    }
    return { success: false, error: error.message, apiResponse: error.response?.data };
  }
}

// === Route สำหรับยิง SMS ด้วยตนเอง (Manual Trigger) === <-- เพิ่ม Route นี้
// คุณสามารถเรียก API นี้จาก Postman/Insomnia หรือ Frontend เพื่อทดสอบได้
app.post('/send-sms', bodyParser.json(), async (req, res) => {
  const { phoneNumber, message } = req.body; // phoneNumber อาจเป็นเบอร์เดียวหรือ array ของเบอร์
  if (!phoneNumber || !message) {
    return res.status(400).json({ error: 'phoneNumber and message are required' });
  }

  const phoneNumbers = Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber];
  const results = [];

  for (const num of phoneNumbers) {
    const result = await sendSmsViaThaiBulkSms(num, message);
    results.push({ phoneNumber: num, ...result });
  }

  res.json({ message: 'SMS sending process initiated', results });
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
    const lineUsersSnapshot = await db.collection('lineUsers').get(); // เปลี่ยนชื่อตัวแปรเป็น lineUsersSnapshot
    const lineUserIds = lineUsersSnapshot.docs.map(doc => doc.id); // ดึงแค่ userId
    if (lineUsersSnapshot.empty) {
      console.warn('⚠️ No LINE users found for LINE broadcast.');
      // แต่ยังสามารถส่ง SMS ได้แม้ไม่มี LINE user
    }

    // ดึงรายชื่อเบอร์โทรศัพท์สำหรับ SMS
    // สมมติว่ามี collection ชื่อ 'smsRecipients' ที่เก็บเบอร์โทรศัพท์
    const smsRecipientsSnapshot = await db.collection('smsRecipients').get(); // <-- ต้องมี collection นี้
    const smsPhoneNumbers = smsRecipientsSnapshot.docs.map(doc => doc.data().phoneNumber); // สมมติว่า field ชื่อ phoneNumber
    if (smsRecipientsSnapshot.empty) {
      console.warn('⚠️ No SMS recipients found for SMS broadcast.');
    }


    for (const doc of newsSnapshot.docs) {
      const data = doc.data();

      // ข้อความ LINE (แบบเต็ม)
      const lineMessage = `📢 แจ้งข่าวจาก ${data.village}
หัวข้อ: ${data.topic}
การจัดการ: ${data.action}
รายละเอียด: ${data.detail}
เวลา: ${data.notifyTime.toDate().toLocaleString()}
เวลาจัดการโดยประมาณ: ${data.fixTime}`;

      // ข้อความ SMS (แบบกระชับ 65 ตัวอักษร)
      const smsMessage = `แจ้ง: หมู่ 1 ไฟฟ้าตัดไฟซ่อมสาย ${data.notifyTime.toDate().toLocaleDateString('th-TH', {day: '2-digit', month: '2-digit', year: '2-digit'}).replace(/\//g, '/')} ${data.notifyTime.toDate().toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false})}-${new Date(data.notifyTime.toDate().getTime() + (data.fixTimeValue || 0) * 60 * 1000).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false})}น. 30 นาที`;
      // หมายเหตุ: data.fixTimeValue ควรเป็นจำนวนนาที เช่น 30 ถ้า data.fixTime เป็น "30 นาที"
      // ต้องมั่นใจว่า notifyTime และ fixTimeValue ถูกเก็บใน Firebase ในรูปแบบที่ถูกต้อง
      // หรือปรับวิธีการสร้าง smsMessage ให้ตรงกับโครงสร้างข้อมูลจริงใน news collection

      // --- ส่งผ่าน LINE ---
      if (lineUserIds.length > 0) {
        const linePushPromises = [];
        lineUserIds.forEach(userId => {
          linePushPromises.push(client.pushMessage(userId, {
            type: 'text',
            text: lineMessage,
          }));
        });
        await Promise.all(linePushPromises);
        console.log(`📬 ส่งข่าว LINE ให้ผู้ใช้ ${lineUserIds.length} คน`);
      }

      // --- ส่งผ่าน SMS ---
      if (smsPhoneNumbers.length > 0) {
        const smsSendPromises = [];
        // Loop ส่ง SMS ทีละเบอร์ (หรือตามความสามารถของ API Batching)
        for (const phoneNumber of smsPhoneNumbers) {
          smsSendPromises.push(sendSmsViaThaiBulkSms(phoneNumber, smsMessage));
        }
        await Promise.all(smsSendPromises);
        console.log(`📱 ส่ง SMS ให้ผู้ใช้ ${smsPhoneNumbers.length} คน`);
      }

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

// ส่วนของ /line-users, /messages/:userId, /send-message, /mark-as-read/:userId ยังคงเหมือนเดิม
app.get('/line-users', async (req, res) => {
  try {
    const snapshot = await db.collection('lineUsers').get();
    const users = [];

    let count = 1;

    for (const doc of snapshot.docs) {
      const userId = doc.id;
      const label = `บุคคลที่ ${count++}`;

      // อ่าน subcollection messages
      const messagesSnap = await db.collection('lineUsers')
        .doc(userId)
        .collection('messages')
        .where('direction', '==', 'in')
        .where('unread', '==', true)
        .get();

      const unreadCount = messagesSnap.size;

      users.push({
        userId,
        label,
        unreadCount,
      });
    }

    res.json(users); // ส่งเป็น array ตรง ๆ ไม่ต้อง { users } เพราะ frontend รอเป็น array แล้ว
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});


app.get('/messages/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const messagesRef = db.collection('lineUsers').doc(userId).collection('messages');
    const snapshot = await messagesRef.orderBy('timestamp', 'asc').get();

    const messages = snapshot.docs.map(doc => doc.data());
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});


app.post('/send-message', bodyParser.json(), async (req, res) => {
    console.log('[DEBUG] req.body:', req.body);
  const { userId, message } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' });
  }

  try {
    // ส่งข้อความผ่าน LINE API
    await client.pushMessage(userId, {
      type: 'text',
      text: message,
    });

    // บันทึกข้อความ outgoing
    await db.collection('lineUsers').doc(userId)
      .collection('messages').add({
        direction: 'out', // ข้อความส่งออก
        message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.post('/mark-as-read/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const snapshot = await db.collection('lineUsers').doc(userId).collection('messages')
      .where('unread', '==', true).get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { unread: false });
    });

    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});


// === Start Server ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});