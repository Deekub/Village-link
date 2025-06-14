const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const LINE_ACCESS_TOKEN = '7UHihQK2m+X/8Xr8C7fKLetymWAcTHuloezvcFGjTF0Ww1wNtvx1UYv/vE2ccFBNEDr5WFKo7+5jp3TorPcrrtVTil6gcIV9k758KaLBXBfSZHB1H7cpVZ2CvdHXmNVvjMgd7psXZYgkfB6517fynAdB04t89/1O/w1cDnyilFU='; // ใช้ Messaging API access token

exports.sendBroadcast = functions.https.onRequest(async (req, res) => {
  const message = req.body.message; // รับข้อความจากฟอร์มส่งข่าวสาร

  if (!message) {
    return res.status(400).send('Message is required');
  }

  try {
    const snapshot = await db.collection('lineUsers').get();

    const userIds = snapshot.docs.map(doc => doc.id);

    for (const userId of userIds) {
        console.log('จะส่งข้อความ LINE ไปหา userId:', userId);

      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          to: userId,
          messages: [
            {
              type: 'text',
              text: message
            }
          ]
        })
      });
    }

    res.status(200).send(`✅ ส่งข้อความแล้วทั้งหมด ${userIds.length} คน`);
  } catch (error) {
    console.error('❌ Error sending broadcast:', error);
    res.status(500).send('Error sending message');
  }
});
