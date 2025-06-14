const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const app = express();
const port = 3000;

dotenv.config();
app.use(express.json());

app.post('/notify', async (req, res) => {
  const { message } = req.body;

  try {
    await axios.post(
      'https://notify-api.line.me/api/notify',
      new URLSearchParams({ message }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${process.env.LINE_NOTIFY_TOKEN}`,
        },
      }
    );

    res.status(200).send({ success: true });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).send({ success: false });
  }
});

app.listen(port, () => {
  console.log(`LINE Notify backend running at http://localhost:${port}`);
});
