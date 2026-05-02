const mongoose = require('mongoose');

async function connect() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set in environment');

  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = { connect };
