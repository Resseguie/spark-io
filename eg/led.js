var five   = require("johnny-five"),
  Spark    = require("../lib/spark"),
  temporal = require("temporal"),
  board;


// Create Johnny-Five board connected via Spark
board = new five.Board({
  io: new Spark({
    token: process.env.SPARK_TOKEN,
    deviceId: process.env.SPARK_DEVICE_ID
  })
});

board.on("ready", function() {
  var led = new five.Led(process.argv[2] || "D0");

  this.repl.inject({
    led: led
  });

  temporal.queue([
    {
      delay: 0,
      task: function(){
        // on()
        //
        // Turns the led on
        led.on();
        console.log("led on");
      }
    },{
      delay: 1000,
      task: function(){
        // off()
        //
        // Turns the led off
        led.off();
        console.log("led off");
      }
    },
/* Commenting out pulse because it kills the Spark!
    {
      delay: 1000,
      task: function(){
        // pulse()
        //
        // Pulse the led (fade in and out)
        led.pulse();
        console.log("led pulse");
      }
    },
*/
    {
      delay: 3000,
      task: function(){
        // strobe()
        //
        // Strobe the led (on/off)
        led.strobe();
        console.log("led strobe");
      }
    },{
      delay: 3000,
      task: function(){
        // stop()
        //
        // Stop the pulse
        led.stop();
        console.log("led stop");

        // If you want to make sure it's off
        // in case it stopped it while on
        led.off();
      }
    },{
      delay: 1000,
      task: function(){
        // fadeIn()
        //
        // Fade in the led
        led.fadeIn();
        console.log("led fadeIn");
      }
    },{
      delay: 3000,
      task: function(){
        // fadeOut()
        //
        // Fade out the led
        led.fadeOut();
        console.log("led fadeOut");
      }
    },{
      delay: 3000,
      task: function(){
        // brightness ()
        //
        // set analog brightness (0-255)
        led.brightness(100);
        console.log("led brightness");

        // Exit gracefully
        process.exit(0);
      }
    }
  ]);


});

// @markdown
// To make use of `Led` methods like `fade`, `pulse`, `animate`, you'll need to
// wire an LED to a PWM pin (A0, A1, A4, A5, A6, A7, D0 and D1).
// If you use a different pin, make sure to run the script with the correct pin number:
//
// `node eg/led.js [pinNumber]`
// @markdown