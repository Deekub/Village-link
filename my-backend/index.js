const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');
const cron = require('node-cron'); // ยังคง import ไว้เผื่อใช้งานในอนาคต แต่จะปิดการทำงานเดิม
const cors = require('cors');
// const { Timestamp } = require('firebase-admin/firestore'); // ไม่จำเป็นต้อง import Timestamp แยกจากตรงนี้
const axios = require('axios');
// const { addDoc, collection } = require('firebase/firestore'); // *** ลบบรรทัดนี้ออก ***

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

// *** ดึง getFirestore และ Timestamp จาก firebase-admin/firestore โดยตรง ***
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const db = getFirestore(); // *** ใช้ getFirestore() ที่นี่ ***

// === LINE Bot Config ===
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

console.log('🔐 LINE_CHANNEL_SECRET:', process.env.LINE_CHANNEL_SECRET);

// === Thaibulksms API Config ===
const THAI_BULK_SMS_API_URL = 'https://api-v2.thaibulksms.com/sms';
const THAI_BULK_SMS_API_KEY = process.env.THAI_BULK_SMS_API_KEY;
const THAI_BULK_SMS_API_SECRET = process.env.THAI_BULK_SMS_API_SECRET;
const THAI_BULK_SMS_SENDER_NAME = process.env.THAI_BULK_SMS_SENDER_NAME; // เราจะส่ง sender ใน request body

console.log("sender :", THAI_BULK_SMS_SENDER_NAME);

if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET || !THAI_BULK_SMS_SENDER_NAME) {
    console.warn("🚨 THAI_BULK_SMS_API_KEY, THAI_BULK_SMS_API_SECRET, or THAI_BULK_SMS_SENDER_NAME are not fully set in .env. SMS sending might be affected.");
} else {
    console.log("✅ Thaibulksms API credentials are set.");
}

// === Middleware ===
app.use(cors({
    origin: ['http://localhost:8081', 'https://village-link.vercel.app', 'https://example.com'], // เพิ่ม Production URL ของ Frontend ที่นี่
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));
app.use(bodyParser.json()); // ใช้ bodyParser.json() แบบ global อีกครั้ง เพื่อความสะดวก

// === Helper Functions ===

// แปลงวันที่เป็น วว/ดด/ปปปป (ปี พ.ศ. 2 หลัก)
const formatDate = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    // แปลงปี ค.ศ. ให้เป็น พ.ศ. (yyyy+543) และใช้แค่ 2 หลักสุดท้าย
    const yyyyBuddhist = String(date.getFullYear() + 543).slice(-2);
    return `${dd}/${mm}/${yyyyBuddhist}`;
};

// แปลงเวลาเป็น hh:mm (24 ชั่วโมง)
const formatTime24 = (date) => {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
};

// ฟังก์ชันสำหรับสร้างข้อความแจ้งเตือน (LINE และ SMS) พร้อมคำนวณเวลา
function generateMessages(
    notifyDateTime, // Combined Date and Time of the event
    fixHour,
    fixMinute,
    repeatCount,
    frequencyHour,
    frequencyMinute,
    village,
    topic,
    action,
    detail
) {
    const messages = [];
    const notificationTimes = [];
    const eventTime = new Date(notifyDateTime); // เวลาเริ่มต้นของกิจกรรม (เช่น 7:30 น.)

    // คำนวณเวลาสิ้นสุดการซ่อม
    const finishRepairTime = new Date(
        eventTime.getTime() + (parseInt(fixHour) * 60 + parseInt(fixMinute)) * 60 * 1000
    );

    const fixTimeText = (() => {
        const h = parseInt(fixHour);
        const m = parseInt(fixMinute);
        if (h === 0 && m === 0) return 'ไม่ระบุ';
        if (h === 0) return `${m} นาที`;
        if (m === 0) return `${h} ชั่วโมง`;
        return `${h} ชั่วโมง ${m} นาที`;
    })();

    // คำนวณเวลาแจ้งเตือนย้อนหลัง
    for (let i = 0; i < repeatCount; i++) {
        const currentNotifyTime = new Date(eventTime.getTime() -
            (i * (parseInt(frequencyHour) * 60 + parseInt(frequencyMinute))) * 60 * 1000);
        notificationTimes.unshift(currentNotifyTime); // Add to the beginning to keep chronological order
    }

    notificationTimes.forEach((time, index) => {
        const lineMessage = `📢 แจ้งข่าวบริเวณ ${village} 📢
🏷️หัวข้อ: ${topic}
⚙️การจัดการ: ${action}
📝รายละเอียด: ${detail}
📅 ณ วันที่: ${formatDate(eventTime)}
⏰เวลา: ${formatTime24(eventTime)} น.
⏰ใช้เวลา : ${fixTimeText}
📅เวลาเสร็จสิ้นประมาณ: ${formatTime24(finishRepairTime)} น.
${repeatCount > 1 ? `(การแจ้งเตือนครั้งที่ ${index + 1} จาก ${repeatCount})` : ''}`;

        // สำหรับ SMS ควรจะกระชับกว่า LINE
let smsMessage = `แจ้ง: หมู่ ${village} ${topic} ${formatDate(eventTime)} ${formatTime24(eventTime)}-${formatTime24(finishRepairTime)}น. ${fixTimeText}`;
    if (repeatCount > 1) {
        smsMessage += ` (ครั้งที่ ${index + 1}/${repeatCount})`;
    }
        // จำกัดความยาว SMS หากจำเป็น (Thaibulksms 1 Segment = 70 ตัวอักษรสำหรับภาษาไทย)
        // คุณอาจจะต้องมี logic การตัดหรือย่อข้อความที่ซับซ้อนขึ้นอยู่กับความต้องการ
        if (smsMessage.length > 150) { // ประมาณ 2 segments
            smsMessage = smsMessage.substring(0, 150) + '...'; // ตัดข้อความ
        }
        
        messages.push({
            timeToSend: time,
            lineMessage: lineMessage,
            smsMessage: smsMessage
        });
    });

    return messages;
}


// === ฟังก์ชันสำหรับส่ง SMS ผ่าน Thaibulksms API ===
async function sendSmsViaThaiBulkSms(phoneNumber, message) {
    if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET || !THAI_BULK_SMS_SENDER_NAME) {
        console.warn("⚠️ SMS API credentials not fully set. Skipping SMS send for this call.");
        return { success: false, error: "SMS API credentials not set" };
    }

    try {
        const authHeader = 'Basic ' + Buffer.from(THAI_BULK_SMS_API_KEY + ':' + THAI_BULK_SMS_API_SECRET).toString('base64');
        const requestBody = new URLSearchParams({
            msisdn: phoneNumber,
            message: message,
            sender: THAI_BULK_SMS_SENDER_NAME, // ส่ง Sender Name ด้วย
        }).toString();

        console.log("Sending SMS Request Body:", requestBody);

        const response = await axios.post(THAI_BULK_SMS_API_URL, requestBody, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data && response.data.bad_phone_number_list && response.data.bad_phone_number_list.length === 0) {
            console.log(`✅ SMS sent successfully to ${phoneNumber}:`, response.data);
            return { success: true, data: response.data };
        } else {
            const errorMessage = response.data.bad_phone_number_list && response.data.bad_phone_number_list.length > 0
                ? `Failed for some numbers: ${JSON.stringify(response.data.bad_phone_number_list)}`
                : (response.data.status_code ? `API Error ${response.data.status_code}: ${response.data.status_text}` : 'Unknown API error');
            console.error(`❌ Failed to send SMS to ${phoneNumber}:`, errorMessage, response.data);
            return { success: false, error: errorMessage, apiResponse: response.data };
        }
    } catch (error) {
        console.error(`❌ Error sending SMS to ${phoneNumber} via API:`, error.message);
        if (error.response) {
            console.error("   Response data:", error.response.data);
            console.error("   Response status:", error.response.status);
            if (error.response.status === 401 || error.response.status === 403) {
                console.error("   Possible API Key/Secret issue, incorrect sender name, or IP Whitelist not configured.");
            }
        }
        return { success: false, error: error.message, apiResponse: error.response?.data };
    }
}


// === Routes ===
app.get('/', (req, res) => {
    res.send('👋 Hello from Node.js + Firebase + LINE API Server!');
});

// Endpoint สำหรับรับข้อมูลข่าวสารและส่ง LINE/SMS ทันที
app.post('/notify', async (req, res) => {
    const {
        village,
        topic,
        action,
        detail,
        notifyTime, // จะเป็น ISO string จาก Frontend
        fixHour,
        fixMinute,
        repeatCount,
        frequencyHour,
        frequencyMinute,
        sendSms // true/false จาก Frontend
    } = req.body;

    // Validate required fields
    if (!village || !topic || !action || !detail || !notifyTime ||
        fixHour === undefined || fixMinute === undefined ||
        repeatCount === undefined || frequencyHour === undefined || frequencyMinute === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedNotifyTime = new Date(notifyTime); // แปลงกลับเป็น Date object

    try {
        // --- ดึงผู้ใช้งาน LINE และ SMS ---
        const lineUsersSnapshot = await db.collection('lineUsers').get();
        const lineUserIds = lineUsersSnapshot.docs.map(doc => doc.id);

        const smsRecipientsSnapshot = await db.collection('smsRecipients').get();
        const smsPhoneNumbers = smsRecipientsSnapshot.docs
            .map(doc => doc.data().phoneNumber)
            .filter(num => typeof num === 'string' && num.length > 0);

        if (lineUserIds.length === 0) {
            console.warn('⚠️ No LINE users found for LINE broadcast.');
        }
        if (sendSms && smsPhoneNumbers.length === 0) {
            console.warn('⚠️ Send SMS selected, but no valid SMS recipients found.');
        }

        // --- สร้างข้อความแจ้งเตือนทั้งหมดตามความถี่และจำนวนครั้ง ---
        const scheduledMessages = generateMessages(
            parsedNotifyTime,
            fixHour,
            fixMinute,
            parseInt(repeatCount),
            parseInt(frequencyHour),
            parseInt(frequencyMinute),
            village, topic, action, detail
        );

        let lineSentCount = 0;
        let smsSentCount = 0;

        // --- ส่งข้อความตามที่คำนวณได้ ---
        for (const msgData of scheduledMessages) {
            const { timeToSend, lineMessage, smsMessage } = msgData;
            // ณ จุดนี้ เราจะส่งข้อความทันที (หรือตั้งเวลาส่งด้วยระบบ Queue หากต้องการ delay)
            // แต่เนื่องจากคุณต้องการ "ทันที" เราจะยิงเลย
            
            console.log(`Attempting to send message for time: ${timeToSend.toLocaleString()}`);

            // ส่ง LINE Notification
            if (lineUserIds.length > 0) {
                const linePushPromises = [];
                lineUserIds.forEach(userId => {
                    linePushPromises.push(client.pushMessage(userId, {
                        type: 'text',
                        text: lineMessage,
                    }));
                });
                await Promise.all(linePushPromises);
                lineSentCount += lineUserIds.length;
                console.log(`📬 LINE message sent to ${lineUserIds.length} users for time ${timeToSend.toLocaleTimeString()}`);
            }

            // ส่ง SMS
            if (sendSms && smsPhoneNumbers.length > 0) {
                const smsSendPromises = [];
                for (const phoneNumber of smsPhoneNumbers) {
                    smsSendPromises.push(sendSmsViaThaiBulkSms(phoneNumber, smsMessage));
                }
                const smsResults = await Promise.all(smsSendPromises);
                smsSentCount += smsPhoneNumbers.length; // นับจำนวนที่พยายามส่ง
                console.log(`📱 SMS message sent to ${smsPhoneNumbers.length} numbers for time ${timeToSend.toLocaleTimeString()}`);
            }

            // เพิ่ม delay สั้นๆ ระหว่างการส่งแต่ละรอบ เพื่อไม่ให้ API โหลดเกินไป (ถ้ามีการส่งหลายครั้งมากๆ)
            if (scheduledMessages.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 วินาที
            }
        }

        // *** บันทึกข้อมูลลง Firestore (เป็น record การส่ง) โดยใช้ Admin SDK syntax ***
        await db.collection('news_broadcasts').add({
            village,
            topic,
            action,
            detail,
            notifyTime: Timestamp.fromDate(parsedNotifyTime),
            fixTime: fixTimeText, // ใช้ fixTimeText ที่คำนวณแล้ว
            repeatCount: parseInt(repeatCount),
            frequencyHour: parseInt(frequencyHour),
            frequencyMinute: parseInt(frequencyMinute),
            sendSms: sendSms,
            messagesSent: scheduledMessages.length, // จำนวนข้อความที่ส่ง
            lineUsersNotified: lineSentCount,
            smsNumbersNotified: smsSentCount,
            broadcastedAt: Timestamp.now(), // เวลาที่กดส่งข่าว
        });


        res.json({
            message: `Broadcast initiated successfully. ${lineSentCount} LINE messages and ${smsSentCount} SMS messages attempted.`,
            lineSentCount,
            smsSentCount
        });

    } catch (error) {
        console.error('Error in /notify endpoint:', error);
        res.status(500).json({ error: 'Failed to initiate broadcast', details: error.message });
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

// === Route สำหรับยิง SMS ด้วยตนเอง (Manual Trigger) ===
app.post('/send-sms', async (req, res) => {
    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
        return res.status(400).json({ error: 'phoneNumber and message are required' });
    }

    if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET || !THAI_BULK_SMS_SENDER_NAME) {
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

// ส่วนของ /line-users, /messages/:userId, /send-message, /mark-as-read/:userId ยังคงเหมือนเดิม
app.get('/line-users', async (req, res) => {
    try {
        const snapshot = await db.collection('lineUsers').get();
        const users = [];

        let count = 1;

        for (const doc of snapshot.docs) {
            const userId = doc.id;
            const label = `บุคคลที่ ${count++}`;

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

app.post('/send-message', async (req, res) => {
    console.log('[DEBUG] req.body:', req.body);
    const { userId, message } = req.body;
    if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message are required' });
    }

    try {
        await client.pushMessage(userId, {
            type: 'text',
            text: message,
        });

        await db.collection('lineUsers').doc(userId)
            .collection('messages').add({
                direction: 'out',
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