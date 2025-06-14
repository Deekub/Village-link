const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const app = express();
const port = 3000;

dotenv.config();
app.use(express.json());

app.post('/notify', async (req, res) => {
  const { message } = req.body;

  console.log('[DEBUG] รับข้อความ:', message);
  console.log('[DEBUG] Token:', process.env.LINE_NOTIFY_TOKEN);

  try {
    const result = await axios.post(
      'https://notify-api.line.me/api/notify',
      new URLSearchParams({ message }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${process.env.LINE_NOTIFY_TOKEN}`,
        },
      }
    );

    console.log('[DEBUG] LINE response:', result.data);
    res.status(200).send({ success: true });
  } catch (err) {
    console.error('[ERROR]', err.response?.data || err.message);
    res.status(500).send({ success: false });
  }
});

app.listen(port, () => {
  console.log(`LINE Notify backend running at http://localhost:${port}`);
});
