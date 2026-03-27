import apiHandler from './api/index.js';
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.all('*', (req, res) => {
  return apiHandler(req, res);
});

app.listen(port, () => {
  console.log(`
  🚀 Squadra CRM is running!
  > Local:    http://localhost:${port}
  > Mode:     ${process.env.NODE_ENV || 'development'}
  `);
});
