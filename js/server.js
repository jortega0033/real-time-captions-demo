require('dotenv').config()
const express = require('express');
const PORT = process.env.PORT || 8000
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', async (req, res) => {
  try {
    const response = await axios.post(
      'https://streaming.assemblyai.com/v3/token?expires_in_seconds=3600',
      null,
      { headers: { authorization: process.env.API_KEY } },
    );
    const { data } = response;
    res.json(data);
  } catch (error) {
    const {response: {status, data}} = error;    
    res.status(status).json(data);
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))