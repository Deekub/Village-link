const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');
const cron = require('node-cron');
const cors = require('cors');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const axios = require('axios');

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

const db = getFirestore();

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
const THAI_BULK_SMS_SENDER_NAME = process.env.THAI_BULK_SMS_SENDER_NAME;

console.log("sender :", THAI_BULK_SMS_SENDER_NAME);

if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET || !THAI_BULK_SMS_SENDER_NAME) {
    console.warn("🚨 THAI_BULK_SMS_API_KEY, THAI_BULK_SMS_API_SECRET, or THAI_BULK_SMS_SENDER_NAME are not fully set in .env. SMS sending might be affected.");
} else {
    console.log("✅ Thaibulksms API credentials are set.");
}

// === Middleware ===
app.use(cors({
    origin: ['http://localhost:8081', 'https://village-link.vercel.app', 'https://example.com'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));
app.use(bodyParser.json());

// === Helper Functions ===

const formatDate = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyyBuddhist = String(date.getFullYear() + 543).slice(-2);
    return `${dd}/${mm}/${yyyyBuddhist}`;
};

const formatTime24 = (date) => {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
};

// ฟังก์ชันสำหรับสร้างข้อความ (LINE หลายรอบ, SMS รอบเดียว) พร้อมคำนวณเวลา
// จะคืนค่าเป็น Array ของ { lineMessage, smsMessage, timeToSend }
// โดยที่ smsMessage จะมีค่าสำหรับ timeToSend ครั้งแรกเท่านั้น
function generateMessages(
    eventTime, // Base event time (Date object)
    fixHour,
    fixMinute,
    lineRepeatCount, // สำหรับ LINE
    lineFrequencyHour,
    lineFrequencyMinute,
    village,
    topic,
    action,
    detail
) {
    const messages = [];
    const notificationTimes = [];

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

    // คำนวณเวลาแจ้งเตือนย้อนหลังสำหรับ LINE
    // ถ้า lineRepeatCount เป็น 1 หรือ 0 ก็ส่งแค่ครั้งเดียวที่ eventTime
    const actualLineRepeatCount = parseInt(lineRepeatCount) > 0 ? parseInt(lineRepeatCount) : 1;

    for (let i = 0; i < actualLineRepeatCount; i++) {
        const currentNotifyTime = new Date(eventTime.getTime() -
            (i * (parseInt(lineFrequencyHour) * 60 + parseInt(lineFrequencyMinute))) * 60 * 1000);
        notificationTimes.unshift(currentNotifyTime); // Add to the beginning to keep chronological order
    }
    
    // สร้างข้อความสำหรับแต่ละรอบ (LINE) และสำหรับ SMS (เฉพาะรอบแรก)
    notificationTimes.forEach((time, index) => {
        const lineMessage = `📢 แจ้งข่าวบริเวณ ${village} 📢
🏷️หัวข้อ: ${topic}
⚙️การจัดการ: ${action}
📝รายละเอียด: ${detail}
📅 ณ วันที่: ${formatDate(eventTime)}
⏰เวลา: ${formatTime24(eventTime)} น.
⏰ใช้เวลา : ${fixTimeText}
📅เวลาเสร็จสิ้นประมาณ: ${formatTime24(finishRepairTime)} น.
${actualLineRepeatCount > 1 ? `(การแจ้งเตือนครั้งที่ ${index + 1} จาก ${actualLineRepeatCount})` : ''}`;

        let smsMessage = null; // Default: SMS ไม่ส่งในรอบนี้

        // SMS จะถูกสร้างและส่งเฉพาะครั้งแรกเท่านั้น (index === 0)
        if (index === 0) {
            let smsText = `แจ้ง: ม.${village} ${topic} ${action} ${formatDate(eventTime)} ${formatTime24(eventTime)}-${formatTime24(finishRepairTime)}น. ใช้ ${fixTimeText}`;
            if (smsText.length > 65) { // ตัดข้อความ SMS หากยาวเกินไป (เพื่อให้มั่นใจอยู่ใน 1 segment)
                smsText = smsText.substring(0, 62) + '...';
            }
            smsMessage = smsText;
        }
        
        messages.push({
            timeToSend: time,
            lineMessage: lineMessage,
            smsMessage: smsMessage // smsMessage จะเป็น null ในรอบที่ > 0
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
    if (!phoneNumber || !message) {
        console.warn("⚠️ Phone number or message is missing for SMS. Skipping SMS send.");
        return { success: false, error: "Phone number or message is missing" };
    }

    try {
        const authHeader = 'Basic ' + Buffer.from(THAI_BULK_SMS_API_KEY + ':' + THAI_BULK_SMS_API_SECRET).toString('base64');
        const requestBody = new URLSearchParams({
            msisdn: phoneNumber,
            message: message,
            sender: THAI_BULK_SMS_SENDER_NAME,
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
        notifyTime, // จะเป็น ISO string จาก Frontend (เวลาที่ใช้จริงในการส่งทันที)
        fixHour,
        fixMinute,
        repeatCount, // จำนวนรอบการแจ้งเตือน LINE ล่วงหน้า (ใช้เพื่อสร้างข้อความ LINE)
        frequencyHour,
        frequencyMinute,
        sendSms // true/false จาก Frontend
    } = req.body;

    // Validate required fields
    if (!village || !topic || !action || !detail || !notifyTime ||
        fixHour === undefined || fixMinute === undefined ||
        repeatCount === undefined || frequencyHour === undefined || frequencyMinute === undefined ||
        sendSms === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedNotifyTime = new Date(notifyTime);

    try {
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

        // generateMessages จะสร้างข้อความ LINE หลายๆ รอบ (ถ้า repeatCount > 1)
        // และจะสร้าง SMS Message เฉพาะสำหรับรอบแรก (index 0)
        const allGeneratedMessages = generateMessages(
            parsedNotifyTime, // ใช้เวลาที่รับมาเป็น base
            parseInt(fixHour),
            parseInt(fixMinute),
            parseInt(repeatCount), // จำนวนรอบ LINE
            parseInt(frequencyHour),
            parseInt(frequencyMinute),
            village, topic, action, detail
        );

        let lineSentCount = 0;
        let smsSentCount = 0;
        
        // สำหรับ /notify เราจะส่งทันที โดยใช้ข้อมูลของ 'รอบแรก' ที่ generateMessages สร้างให้
        const immediateMessageData = allGeneratedMessages[0]; // ข้อความสำหรับเวลา notifyTime ที่ระบุ

        if (immediateMessageData) {
            const { lineMessage, smsMessage } = immediateMessageData;

            console.log(`Attempting to send immediate broadcast.`);

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
                console.log(`📬 LINE message sent to ${lineUserIds.length} users.`);
            }

            // ส่ง SMS (ถ้า sendSms เป็น true และมีเบอร์ และ smsMessage มีค่า - ซึ่งควรจะมีสำหรับ index 0)
            if (sendSms && smsMessage && smsPhoneNumbers.length > 0) {
                const smsResults = [];
                for (const phoneNumber of smsPhoneNumbers) {
                    const result = await sendSmsViaThaiBulkSms(phoneNumber, smsMessage);
                    smsResults.push(result);
                    if (result.success) {
                        smsSentCount++;
                    }
                }
                console.log(`📱 SMS message attempted to send to ${smsPhoneNumbers.length} numbers. ${smsSentCount} succeeded.`);
            } else if (sendSms && !smsMessage) {
                 console.warn("⚠️ SMS send requested, but smsMessage was null for immediate broadcast. This should not happen.");
            }
        }


        // --- บันทึกข้อมูลลง Firestore ใน collection 'news_broadcasts' ---
        // บันทึกเฉพาะข้อมูลของการส่งทันที
        await db.collection('news_broadcasts').add({
            village,
            topic,
            action,
            detail,
            notifyTime: Timestamp.fromDate(parsedNotifyTime),
            fixHour: parseInt(fixHour),
            fixMinute: parseInt(fixMinute),
            repeatCount: parseInt(repeatCount), // เก็บ repeatCount และ frequency ตามที่ผู้ใช้ต้องการ
            frequencyHour: parseInt(frequencyHour),
            frequencyMinute: parseInt(frequencyMinute),
            sendSms: sendSms,
            lineUsersNotified: lineSentCount,
            smsNumbersNotified: smsSentCount,
            broadcastedAt: Timestamp.now(), // เวลาที่ทำการ broadcast นี้
        });


        res.json({
            message: `Immediate broadcast initiated successfully. ${lineSentCount} LINE messages and ${smsSentCount} SMS messages attempted.`,
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

        await db.collection('lineUsers').doc(userId)
            .collection('messages').add({
                direction: 'in',
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

    return Promise.resolve(null);
}


// === Route สำหรับยิง SMS ด้วยตนเอง (Manual Trigger) ===
app.post('/send-sms', async (req, res) => {
    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
        return res.status(400).json({ error: 'phoneNumber and message are required' });
    }

    if (!THAI_BULK_SMS_API_KEY || !THAI_BULK_SMS_API_SECRET || !THAI_BULK_SMS_SENDER_NAME) {
        return res.status(503).json({ error: "SMS API credentials not fully set. Please configure .env file and ensure Sender Name is set." });
    }

    const phoneNumbers = Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber];
    const results = [];
    let successCount = 0;

    for (const num of phoneNumbers) {
        const result = await sendSmsViaThaiBulkSms(num, message);
        results.push({ phoneNumber: num, ...result });
        if (result.success) {
            successCount++;
        }
    }

    res.json({ message: `SMS sending process initiated. ${successCount} successful.`, results, successCount });
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


// === Cron Job: Run every 15 minutes ===
cron.schedule('*/15 * * * *', async () => {
    console.log('🔄 Running scheduled broadcast task');

    try {
        const now = new Date();

        const newsSnapshot = await db.collection('news')
            .where('sent', '==', false)
            .where('notifyTime', '<=', Timestamp.fromDate(now))
            .get();

        if (newsSnapshot.empty) {
            console.log('✅ No scheduled news to broadcast.');
            return;
        }

        const lineUsersSnapshot = await db.collection('lineUsers').get();
        const lineUserIds = lineUsersSnapshot.docs.map(doc => doc.id);

        const smsRecipientsSnapshot = await db.collection('smsRecipients').get();
        const smsPhoneNumbers = smsRecipientsSnapshot.docs
            .map(doc => doc.data().phoneNumber)
            .filter(num => typeof num === 'string' && num.length > 0);

        if (lineUserIds.length === 0) {
            console.warn('⚠️ No LINE users found for LINE broadcast in cron job.');
        }
        if (smsPhoneNumbers.length === 0) {
            console.warn('⚠️ No valid SMS recipients found in "smsRecipients" collection for SMS broadcast in cron job.');
        }

        for (const doc of newsSnapshot.docs) {
            const data = doc.data();

            if (data.notifyTime.toDate() <= now && data.repeatCount > 0) {
                // Generate messages for this news item
                const allGeneratedMessages = generateMessages(
                    data.initialNotifyTime.toDate(), // ใช้ initialNotifyTime เป็น Base time สำหรับการ generate ข้อความ
                    parseInt(data.fixHour),
                    parseInt(data.fixMinute),
                    parseInt(data.initialRepeatCount), // จำนวนรอบ LINE ทั้งหมด
                    parseInt(data.frequencyHour),
                    parseInt(data.frequencyMinute),
                    data.village, data.topic, data.action, data.detail
                );

                // หาข้อความของรอบปัจจุบัน (Line) และ SMS
                // ข้อความ LINE ควรจะเป็นสำหรับรอบปัจจุบันที่กำลังส่ง
                // ข้อความ SMS จะมาจาก index 0 ของ allGeneratedMessages หากมี (และยังไม่เคยส่ง SMS)
                const currentLineMessageIndex = data.initialRepeatCount - data.repeatCount;
                const currentLineMessageData = allGeneratedMessages[currentLineMessageIndex];
                
                const initialSmsMessageData = allGeneratedMessages[0]; // SMS มาจากรอบแรกเสมอ

                if (!currentLineMessageData) {
                    console.error(`❌ Error: Could not find LINE message data for index ${currentLineMessageIndex} in cron job.`);
                    continue; // ข้ามข่าวนี้ไป
                }

                // --- ส่งผ่าน LINE ---
                if (lineUserIds.length > 0) {
                    const linePushPromises = [];
                    lineUserIds.forEach(userId => {
                        linePushPromises.push(client.pushMessage(userId, {
                            type: 'text',
                            text: currentLineMessageData.lineMessage,
                        }));
                    });
                    await Promise.all(linePushPromises);
                    console.log(`📬 ส่งข่าว LINE ให้ผู้ใช้ ${lineUserIds.length} คน (จาก Cron Job, รอบที่ ${currentLineMessageIndex + 1})`);
                }

                // --- ส่งผ่าน SMS (ถ้า `sendSms` เป็น true ในข่าวสาร และยังไม่เคยส่ง และมีผู้รับ) ---
                const shouldSendSms = data.sendSms !== undefined ? data.sendSms : true; // Default เป็น true
                const hasSmsBeenSent = data.smsSentOnce || false; // Field ใหม่: true ถ้าส่ง SMS ไปแล้ว
                
                if (shouldSendSms && !hasSmsBeenSent && initialSmsMessageData.smsMessage && smsPhoneNumbers.length > 0 && THAI_BULK_SMS_API_KEY && THAI_BULK_SMS_API_SECRET && THAI_BULK_SMS_SENDER_NAME) {
                    const smsSendPromises = [];
                    for (const phoneNumber of smsPhoneNumbers) {
                        smsSendPromises.push(sendSmsViaThaiBulkSms(phoneNumber, initialSmsMessageData.smsMessage));
                    }
                    await Promise.all(smsSendPromises);
                    console.log(`📱 ส่ง SMS ให้ผู้ใช้ ${smsPhoneNumbers.length} คน (จาก Cron Job, ส่งครั้งแรก)`);
                    
                    // อัปเดต field smsSentOnce เป็น true หลังจากส่ง SMS ครั้งแรก
                    await doc.ref.update({ smsSentOnce: true });
                } else if (shouldSendSms && hasSmsBeenSent) {
                    console.log(`✔️ SMS สำหรับข่าว "${data.topic}" ได้ถูกส่งไปแล้ว (Cron Job)`);
                } else if (shouldSendSms && !hasSmsBeenSent && !initialSmsMessageData.smsMessage) {
                    console.warn(`⚠️ SMS send enabled, but initialSmsMessageData.smsMessage is null for news: "${data.topic}".`);
                } else if (shouldSendSms && !hasSmsBeenSent && smsPhoneNumbers.length === 0) {
                    console.warn(`⚠️ SMS enabled for news "${data.topic}", but no SMS recipients found.`);
                }


                // คำนวณเวลารอบถัดไปของ LINE
                const frequencyInMinutes = (parseInt(data.frequencyHour) * 60 + parseInt(data.frequencyMinute));
                const nextNotifyTime = new Date(data.notifyTime.toDate().getTime() + frequencyInMinutes * 60 * 1000);

                if (data.repeatCount > 1) {
                    await doc.ref.update({
                        notifyTime: Timestamp.fromDate(nextNotifyTime),
                        repeatCount: data.repeatCount - 1,
                    });
                    console.log(`🔁 เตรียมรอบ LINE ถัดไปอีก ${data.repeatCount - 1} ครั้ง (Cron Job)`);
                } else {
                    await doc.ref.update({ sent: true }); // หรือลบเอกสาร
                    console.log(`✅ รอบ LINE สุดท้ายแล้ว ปิดการส่ง (Cron Job)`);
                }
            } else if (data.notifyTime.toDate() > now) {
                console.log(`🕒 ข่าว "${data.topic}" ยังไม่ถึงเวลาส่ง (เหลือ ${data.repeatCount} ครั้ง)`);
            } else if (data.repeatCount === 0) {
                console.log(`✔️ ข่าว "${data.topic}" ส่งครบทุกรอบแล้ว (ถูกตั้งค่า sent: true แล้ว)`);
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