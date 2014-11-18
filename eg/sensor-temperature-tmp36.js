var five = require("johnny-five"),
  Spark = require("../lib/spark.js"),
  board, sensor;

// Create Johnny-Five board connected via Spark
board = new five.Board({
  io: new Spark({
    token: process.env.SPARK_TOKEN,
    deviceId: process.env.SPARK_DEVICE_ID
  })
});


board.on("ready", function() {

  sensor = new five.Sensor({
    pin: "A7",
    freq: 1000
  });

  sensor.on("data", function() {
    // TMP36
    var mV = this.value * (3300/1024);
    var celsius = (mV - 500) / 10;
    var fahrenheit = celsius * (9 / 5) + 32;
    console.log(celsius + "Â°C", fahrenheit + "Â°F");
  });

});

// @markdown
// - [TMP36 - Temperature Sensor](https://www.sparkfun.com/products/10988)
// @markdown
