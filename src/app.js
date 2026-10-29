require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const errorHandler = require('./middlewares/error.middleware');
const authRouter = require("./modules/auth/auth.routes"); 
const gateRouter = require("./modules/qr-code/gate.route"); 
const adminRouter = require("./modules/admin/admin.routes");
const teamRouter = require("./modules/teams/team.routes");
const resultsRouter = require("./modules/results/results.routes");
const playersRouter = require("./modules/players/players.routes");






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
app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter); 
app.use("/api/teams", teamRouter);
app.use("/api/gate", gateRouter);
app.use("/api/players", playersRouter); 
app.use("/api/results", resultsRouter);

app.use(errorHandler);
module.exports = app;