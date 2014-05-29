var five = require("johnny-five"),
  Spark = require("../lib/spark"),
  board;

// Create Johnny-Five board connected via Spark
board = new five.Board({
  io: new Spark({
    token: process.env.SPARK_TOKEN,
    deviceId: process.env.SPARK_DEVICE_ID
  })
});

// The board's pins will not be accessible until
// the board has reported that it is ready
board.on("ready", function() {
  console.log("CONNECTED");

  var val = 0;

  // Create a loop to "flash/blink/strobe" an led
  this.loop(100, function() {
    this.digitalWrite("D7", (val = val ? 0 : 1));
  });
});

board.on("error", function(error) {
  console.log(error);
});

