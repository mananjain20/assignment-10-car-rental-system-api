const app = require('./server');

const PORT = 5006;
const server = app.listen(PORT, () => {
  console.log(`Server started successfully on port ${PORT}`);
  server.close(() => {
    console.log('Server closed cleanly.');
    process.exit(0);
  });
});
