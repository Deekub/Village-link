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
// URL จากเอกสาร API เวอร์ชัน 2.0 (หน้า 4 ของ PDF)
const THAI_BULK_SMS_API_URL = 'https://api-v2.thaibulksms.com/sms';
const THAI_BULK_SMS_API_KEY = process.env.THAI_BULK_SMS_API_KEY;
const THAI_BULK_SMS_API_SECRET = process.env.THAI_BULK_SMS_API_SECRET;
const THAI_BULK_SMS_SENDER_NAME = process.env.THAI_BULK_SMS_SENDER_NAME;

// ตรวจสอบว่า API Keys ถูกตั้งค่าหรือไม่ (แสดงคำเตือนแต่ไม่หยุดแอป)
if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET) {
  console.warn("🚨 THAI_BULK_SMS_API_KEY and THAI_BULK_SMS_API_SECRET are not fully set in .env. SMS sending might be affected.");
} else {
  console.log("✅ Thaibulksms API credentials are set.");
}

// === Middleware ===
app.use(cors({
  origin: ['http://localhost:8081'], // หรือใส่ array หลาย origin ได้
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// ไม่ใช้ bodyParser.json() แบบ global
// app.use(bodyParser.json());  <--- เอาออก

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
        unread: true,
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
    console.warn("⚠️ SMS API credentials not fully set. Skipping SMS send for this call.");
    return { success: false, error: "SMS API credentials not set" };
  }

  try {
    // สร้าง Basic Authorization header
    const authHeader = 'Basic ' + Buffer.from(THAI_BULK_SMS_API_KEY + ':' + THAI_BULK_SMS_API_SECRET).toString('base64');

    // สร้างข้อมูลที่จะส่งใน body ของ request ในรูปแบบ x-www-form-urlencoded
    const requestBody = new URLSearchParams({
      msisdn: phoneNumber,
      message: message,
      sender: THAI_BULK_SMS_SENDER_NAME,
      // force: 'corporate', // ถ้าต้องการใช้ Corporate SMS ให้เปิดบรรทัดนี้
    }).toString();

    console.log("req body",requestBody);

    const response = await axios.post(THAI_BULK_SMS_API_URL, requestBody, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded' // API v2.0 ใช้ Content-Type นี้
      }
    });

    // จากเอกสาร (หน้า 15) Response ของ API V2.0 จะมี remaining_credit, phone_number_list, bad_phone_number_list
    // การส่งสำเร็จจะดูจาก bad_phone_number_list ที่ว่างเปล่า
    if (response.data && response.data.bad_phone_number_list && response.data.bad_phone_number_list.length === 0) {
      console.log(`✅ SMS sent successfully to ${phoneNumber}:`, response.data);
      return { success: true, data: response.data };
    } else {
      // มีเบอร์ที่ไม่สามารถส่งได้ หรือมี error จาก API
      const errorMessage = response.data.bad_phone_number_list && response.data.bad_phone_number_list.length > 0
                           ? `Failed for some numbers: ${JSON.stringify(response.data.bad_phone_number_list)}`
                           : 'Unknown error or empty bad_phone_number_list';
      console.error(`❌ Failed to send SMS to ${phoneNumber}:`, errorMessage, response.data);
      return { success: false, error: errorMessage, apiResponse: response.data };
    }
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber} via API:`, error.message);
    if (error.response) {
      console.error("  Response data:", error.response.data);
      console.error("  Response status:", error.response.status);
      // ถ้าเป็น 401 หรือ 403 ให้ตรวจสอบ API Key/Secret หรือ IP Whitelist
      if (error.response.status === 401 || error.response.status === 403) {
          console.error("  Possible API Key/Secret issue or IP Whitelist not configured.");
      }
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

  // หากไม่ได้ตั้งค่า API Key/Secret ให้แจ้งเตือนทันที
  if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET) {
      return res.status(503).json({ error: "SMS API credentials not fully set. Please configure .env file." });
  }

  const phoneNumbers = Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber];
  const results = [];

  for (const num of phoneNumbers) {
    const result = await sendSmsViaThaiBulkSms(num, message);
    results.push({ phoneNumber: num, ...result });
  }

  res.json({ message: 'SMS sending process initiated', results });
});


// === Cron Job: Run every 15 minutes === <-- ปรับปรุงส่วนนี้
// **ข้อควรระวัง: เมื่อรันใน Production ตรวจสอบให้แน่ใจว่า Cron job ถูกตั้งเวลาอย่างเหมาะสมและไม่ทำงานซ้ำซ้อน**
// หากคุณตั้งใจให้ส่ง 4 ครั้ง/เดือน ควรปรับความถี่ของ Cron Job หรือ Logic การส่งให้เหมาะสม
// เช่น ตรวจสอบว่าส่งในรอบที่กำหนดของเดือนแล้วหรือไม่
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

    // ดึงรายชื่อเบอร์โทรศัพท์สำหรับ SMS จาก Collection 'smsRecipients'
    // สมมติว่ามี collection ชื่อ 'smsRecipients' ที่เก็บเบอร์โทรศัพท์
    const smsRecipientsSnapshot = await db.collection('smsRecipients').get(); // <-- ต้องมี collection นี้
    const smsPhoneNumbers = smsRecipientsSnapshot.docs
      .map(doc => doc.data().phoneNumber)
      .filter(num => typeof num === 'string' && num.length > 0); // กรองเฉพาะเบอร์ที่ถูกต้องและไม่ว่างเปล่า
    if (smsRecipientsSnapshot.empty || smsPhoneNumbers.length === 0) {
      console.warn('⚠️ No valid SMS recipients found in "smsRecipients" collection for SMS broadcast.');
    } else {
      console.log(`Found ${smsPhoneNumbers.length} SMS recipients.`);
    }


    for (const doc of newsSnapshot.docs) {
      const data = doc.data();

      // ข้อความ LINE (แบบเต็ม)
      // ตรวจสอบว่า data.village, data.topic, etc. มีข้อมูลหรือไม่ก่อนนำมาใช้
      const lineMessage = `📢 แจ้งข่าวจาก ${data.village || 'หมู่บ้าน'}
หัวข้อ: ${data.topic || 'ไม่ระบุ'}
การจัดการ: ${data.action || 'ไม่ระบุ'}
รายละเอียด: ${data.detail || 'ไม่มีรายละเอียด'}
เวลา: ${data.notifyTime ? data.notifyTime.toDate().toLocaleString('th-TH', {hour12: false}) : 'ไม่ระบุ'}
เวลาจัดการโดยประมาณ: ${data.fixTime || 'ไม่ระบุ'}`;


      // ข้อความ SMS (แบบกระชับ 65 ตัวอักษร)
      // สร้างรูปแบบ "แจ้ง: หมู่ 1 ไฟฟ้าตัดไฟซ่อมสาย 14/6/25 16:05-16:35น. 30 นาที"
      let smsDateTimePart = 'ไม่ระบุเวลา';
      if (data.notifyTime && data.fixTime) {
          try {
              // คำนวณ durationMinutes จาก data.fixTime เช่น "30 นาที" หรือ "1 ชั่วโมง 15 นาที"
              let durationMinutes = 0;
              const matchMinutes = data.fixTime.match(/(\d+)\s*นาที/);
              const matchHours = data.fixTime.match(/(\d+)\s*ชั่วโมง/);
              if (matchMinutes) durationMinutes += parseInt(matchMinutes[1], 10);
              if (matchHours) durationMinutes += parseInt(matchHours[1], 10) * 60;

              const startTime = data.notifyTime.toDate();
              const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

              const formattedDate = startTime.toLocaleDateString('th-TH', {day: '2-digit', month: '2-digit', year: '2-digit'}); // เช่น "14/06/68"
              const formattedStartTime = startTime.toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false}); // เช่น "16:05"
              const formattedEndTime = endTime.toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false}); // เช่น "16:35"

              // สร้างส่วนของเวลา "14/6/25 16:05-16:35น. 30 นาที"
              smsDateTimePart = `${formattedDate.replace(/(\d{2})\/(\d{2})\/(\d{2})/, '$1/$2/$3')} ${formattedStartTime}–${formattedEndTime}น. ${durationMinutes} นาที`;
              // ตัวอย่าง: "14/06/68 16:05–16:35น. 30 นาที" (ตรวจสอบความยาวอีกครั้ง)

              // ลองย่อปีให้เป็น 25 แทน 68 ถ้า toLocaleDateString ให้มาเป็น 68
              smsDateTimePart = smsDateTimePart.replace(/(\d{2})\/(\d{2})\/(\d{4})/, (match, d, m, y) => {
                  const shortYear = y.substring(2);
                  return `${d}/${m}/${shortYear}`;
              });


          } catch (e) {
              console.warn("Could not parse notifyTime or fixTime for SMS message. Using default.", e);
              smsDateTimePart = `วันที่ ${data.notifyTime ? data.notifyTime.toDate().toLocaleDateString('th-TH', {day: '2-digit', month: '2-digit', year: '2-digit'}) : 'ไม่ระบุ'}`;
          }
      }
      const smsMessage = `แจ้ง: หมู่ 1 ไฟฟ้าตัดไฟซ่อมสาย ${smsDateTimePart}`;

      // ตรวจสอบความยาว SMS ก่อนส่ง
      if (smsMessage.length > 70) {
          console.warn(`⚠️ SMS message is too long (${smsMessage.length} chars) for 1 segment. Please shorten it: "${smsMessage}"`);
          // คุณอาจจะเพิ่ม logic ตรงนี้เพื่อไม่ให้ส่ง SMS ถ้าเกิน 70 ตัวอักษร
          // หรือทำการตัดข้อความโดยอัตโนมัติ (แต่ต้องระวังความหมายจะเปลี่ยนไป)
      }


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
      // ส่ง SMS ก็ต่อเมื่อมีผู้รับและมีการตั้งค่า API Key/Secret ครบถ้วน
      if (smsPhoneNumbers.length > 0 && THAI_BULK_SMS_API_KEY && THAI_BULK_SMS_API_SECRET) {
        const smsSendPromises = [];
        // Loop ส่ง SMS ทีละเบอร์ (Thaibulksms API ส่งได้ทีละเบอร์ในคำขอเดียว หรือหลายเบอร์คั่นด้วย ,)
        // สำหรับ axios.post แบบ x-www-form-urlencoded ต้องวนส่งทีละเบอร์
        for (const phoneNumber of smsPhoneNumbers) {
          smsSendPromises.push(sendSmsViaThaiBulkSms(phoneNumber, smsMessage));
        }
        await Promise.all(smsSendPromises);
        console.log(`📱 ส่ง SMS ให้ผู้ใช้ ${smsPhoneNumbers.length} คน`);
      } else if (smsPhoneNumbers.length > 0) {
         console.warn("⚠️ SMS recipients found, but SMS API credentials are not fully set. Skipping SMS broadcast.");
      }


      // คำนวณเวลารอบถัดไป (ถ้ามี repeatCount)
      // frequency ควรเป็นรูปแบบ "ทุก X ชั่วโมง Y นาที" (e.g., "ทุก 1 ชั่วโมง 0 นาที")
      const freqMatch = data.frequency ? data.frequency.match(/(\d+)\s*ชั่วโมง\s*(\d+)\s*นาที/) : null;
      if (freqMatch && freqMatch.length >= 3) {
        const h = parseInt(freqMatch[1], 10);
        const m = parseInt(freqMatch[2], 10);
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
        console.log(`❌ frequency ไม่ถูกต้อง หรือไม่มีรูปแบบ "ชั่วโมง นาที" ปิดการส่ง`);
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

    res.json(users);
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