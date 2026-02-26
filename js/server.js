require('dotenv').config()
const express = require('express');
const PORT = process.env.PORT || 8000
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const getApiKey = () => process.env.API_KEY || process.env.ASSEMBLYAI_API_KEY;

const requestToken = async (apiKey) => {
  const endpoint = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=600';
  const headers = { authorization: apiKey };

  try {
    return await axios.get(endpoint, { headers });
  } catch (error) {
    if (error.response?.status !== 405) {
      throw error;
    }

    return axios.post(endpoint, null, { headers });
  }
};

const issueToken = async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing AssemblyAI API key. Set API_KEY in .env and restart the server.',
    });
  }

  try {
    const response = await requestToken(apiKey);
    const { data } = response;
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: 'Failed to issue token' };
    res.status(status).json(data);
  }
};

app.get('/', issueToken);
app.post('/', issueToken);

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))