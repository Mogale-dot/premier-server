require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const errorHandler = require('./middlewares/error.middleware');
const authRouter = require("./modules/auth/auth.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => {
  res.json({ message: 'PCL API is running', status: 'ok' });
});

// Mount routes
app.use("/api/auth", authRouter);

app.use(errorHandler);

module.exports = app;