var es6 = require("es6-shim");
var net = require("net");
var Emitter = require("events").EventEmitter;
var https = require("https");
var priv = new Map();

var errors = {
  cloud: "Unable to connect to spark cloud.",
  firmware: "Unable to connect to the voodoospark firmware, has it been loaded?",
  instance: "Expected instance of Spark.",
  pwm: "PWM is only available on D0, D1, A0, A1, A4, A5, A6, A7"
};

var pins = [
  { id: "D0", modes: [0, 1, 3, 4] },
  { id: "D1", modes: [0, 1, 3, 4] },
  { id: "D2", modes: [0, 1] },
  { id: "D3", modes: [0, 1] },
  { id: "D4", modes: [0, 1] },
  { id: "D5", modes: [0, 1] },
  { id: "D6", modes: [0, 1] },
  { id: "D7", modes: [0, 1] },

  { id: "", modes: [] },
  { id: "", modes: [] },

  { id: "A0", modes: [0, 1, 2, 3, 4] },
  { id: "A1", modes: [0, 1, 2, 3, 4] },
  { id: "A2", modes: [0, 1, 2] },
  { id: "A3", modes: [0, 1, 2] },
  { id: "A4", modes: [0, 1, 2, 3, 4] },
  { id: "A5", modes: [0, 1, 2, 3, 4] },
  { id: "A6", modes: [0, 1, 2, 3, 4] },
  { id: "A7", modes: [0, 1, 2, 3, 4] }
];

var modes = Object.freeze({
  INPUT: 0,
  OUTPUT: 1,
  ANALOG: 2,
  PWM: 3,
  SERVO: 4
});

var modesMap = [
  "INPUT",
  "OUTPUT",
  "ANALOG",
  "PWM",
  "SERVO"
];

var DIGITAL_READ = 0x03;
var ANALOG_READ = 0x04;
var REPORTING = 0x05;
var SAMPLE_INTERVAL = 0x06;
var INTERNAL_RGB = 0x07;

function service(deviceId) {
  return "https://api.spark.io/v1/devices/" + deviceId + "/";
}

function from7BitBytes(lsb, msb) {
  if (Array.isArray(lsb)) {
    msb = lsb[1];
    lsb = lsb[0];
  }
  return lsb | (msb << 0x07);
}

function to7BitBytes(value) {
  return [value & 0x7f, value >> 0x07 & 0x7f];
}


function processReceived(spark, data) {
  var dlength = data.length;
  var length, action, pin, pinName, pinIndex, port,
      lsb, msb, value, portValue, type, event;

  for (var i = 0; i < dlength; i++) {
    spark.buffer.push(data.readUInt8(i));
  }

  length = spark.buffer.length;

  if (length >= 4) {

    while (length && (length % 4) === 0) {
      action = spark.buffer.shift();
      pin = spark.buffer.shift();
      lsb = spark.buffer.shift();
      msb = spark.buffer.shift();

      value = from7BitBytes(lsb, msb);

      // Digital reads are allowed to be
      // reported on Analog pins
      //
      if (action === REPORTING) {
        port = +pin;
        portValue = +value;

        for (var k = 0; k < 8; k++) {
          pinIndex = k + (10 * port);
          event = "digital-read-" + (port ? "A" : "D") + k;
          value = portValue & (1 << k);

          if (typeof spark._events[event] !== "undefined") {
            spark.pins[pinIndex].value = value;
            spark.emit(event, value);
          }
        }
      }

      if (action === DIGITAL_READ ||
          action === ANALOG_READ) {

        if (action === ANALOG_READ) {
          pinName = "A" + (pin - 10);
          type = "analog";

          // This shifts the value 2 places to the left
          // for compatibility with firmata's 10-bit ADC
          // analog values. In the future it might be nice
          // to allow some
          value >>= 2;
        }

        if (action === DIGITAL_READ) {
          pinName = "D" + pin;
          type = "digital";
        }

        event = type + "-read-" + pinName;

        spark.pins[pin].value = value;
        spark.emit(event, value);
      }

      length = spark.buffer.length;
    }
  }
}

function Spark(opts) {
  Emitter.call(this);

  if (!(this instanceof Spark)) {
    return new Spark(opts);
  }

  var state = {
    isConnected: false,
    isReading: false,
    deviceId: opts.deviceId,
    token: opts.token,
    service: service(opts.deviceId),
    host: opts.host || null,
    port: opts.port || 8001,
    client: null,
    socket: null,
    rgb: {
      red: null,
      green: null,
      blue: null
    }
  };

  this.name = "spark-io";
  this.buffer = [];
  this.isReady = false;

  this.pins = pins.map(function(pin) {
    return {
      name: pin.id,
      supportedModes: pin.modes,
      mode: pin.modes[0],
      value: 0
    };
  });

  this.analogPins = this.pins.slice(10).map(function(pin, i) {
    return i;
  });

  // Store private state
  priv.set(this, state);

  var afterCreate = function(error) {
    if (error) {
      this.emit("error", error);
    } else {
      state.isConnected = true;
      this.emit("connect");
    }
  }.bind(this);

  this.connect(function(error, data) {
    // console.log( "connect -> connect -> handler" );

    if (error !== undefined && error !== null) {
      this.emit("error", error);
    } else if (data.cmd !== "VarReturn") {
      this.emit("error", errors.firmware);
    } else {
      var address = data.result.split(":");
      state.host = address[0];
      state.port = parseInt(address[1], 10);
      // Moving into after connect so we can obtain the ip address
      Spark.Client.create(this, afterCreate);
    }
  }.bind(this));
}


Spark.Client = {
  create: function(spark, afterCreate) {
    if (!(spark instanceof Spark)) {
      throw new Error(errors.instance);
    }
    var state = priv.get(spark);
    var connection = {
      host: state.host,
      port: state.port
    };

    var socket = net.connect(connection, function() {
      // Set ready state bit
      spark.isReady = true;
      spark.emit("ready");

      if (!state.isReading) {
        state.isReading = true;
        socket.on("data", function(data) {
          processReceived(spark, data);
        });
      }
    });
    state.socket = socket;

    afterCreate();
  }
};

Spark.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: Spark
  },
  MODES: {
    value: modes
  },
  HIGH: {
    value: 1
  },
  LOW: {
    value: 0
  }
});

Spark.prototype.connect = function(handler) {
  var state = priv.get(this);
  var url = state.service;
  var action = "endpoint";
  var request;

  if (state.isConnected) {
    return this;
  }
  handler = handler.bind(this);

  request = https.get(url + action + "?access_token=" + state.token, function(res) {
    var body = "", err;
    res.on("data", function(d) {
      body += d;
    });
    res.on("end", function () {
      if (res.statusCode === 200) {
          var data = JSON.parse(body);
          if (data.error) {
            err = "ERROR: " + data.code + " " + data.error_description;
          }
          if (handler) {
            handler(err, data);
          }
      } else {
        err = errors.cloud + ": code: " + res.statusCode;
        if (handler) {
          handler(new Error(err));
        } else {
          throw new Error(err);
        }
      }
    });
  });

  return this;
};

Spark.prototype.pinMode = function(pin, mode) {
  var state = priv.get(this);
  var buffer;
  var offset;
  var pinInt;
  var sMode;

  sMode = mode = +mode;

  // Normalize when the mode is ANALOG (2)
  if (mode === 2) {
    // Normalize to pin string name if numeric pin
    if (typeof pin === "number") {
      pin = "A" + pin;
    }
  }

  // For PWM (3), writes will be executed via analogWrite
  if (mode === 3) {
    sMode = 1;
  }

  offset = pin[0] === "A" ? 10 : 0;
  pinInt = (pin.replace(/A|D/, "") | 0) + offset;

  // Throw if attempting to create a PWM or SERVO on an incapable pin
  // True PWM (3) is CONFIRMED available on:
  //
  //     D0, D1, A0, A1, A5
  //
  //
  if (this.pins[pinInt].supportedModes.indexOf(mode) === -1) {
    throw new Error("Unsupported pin mode: " + modesMap[mode] + " for " + pin);
  }

  // Track the mode that user expects to see.
  this.pins[pinInt].mode = mode;

  // Send the coerced mode
  buffer = new Buffer([ 0x00, pinInt, sMode ]);

  // console.log(buffer);
  state.socket.write(buffer);

  return this;
};

["analogWrite", "digitalWrite", "servoWrite"].forEach(function(fn) {
  var isAnalog = fn === "analogWrite";
  var isServo = fn === "servoWrite";
  var action = isAnalog ? 0x02 : (isServo ? 0x41 : 0x01);

  Spark.prototype[fn] = function(pin, value) {
    var state = priv.get(this);
    var buffer = new Buffer(3);
    var offset = pin[0] === "A" ? 10 : 0;
    var pinInt = (pin.replace(/A|D/i, "") | 0) + offset;

    buffer[0] = action;
    buffer[1] = pinInt;
    buffer[2] = value;

    // console.log(buffer);
    state.socket.write(buffer);
    this.pins[pinInt].value = value;

    return this;
  };
});

// TODO: Define protocol for gather this information.
["analogRead", "digitalRead"].forEach(function(fn) {
  var isAnalog = fn === "analogRead";
  // Use 0x05 to get a continuous read.
  var action = 0x05;
  // var action = isAnalog ? 0x04 : 0x03;
  // var offset = isAnalog ? 10 : 0;
  var value = isAnalog ? 2 : 1;
  var type = isAnalog ? "analog" : "digital";

  Spark.prototype[fn] = function(pin, handler) {
    var state = priv.get(this);
    var buffer = new Buffer(3);
    var pinInt;
    var event;

    if (isAnalog && typeof pin === "number") {
      pin = "A" + pin;
    }
    var offset = pin[0] === "A" ? 10 : 0;
    pinInt = (pin.replace(/A|D/i, "") | 0) + offset;
    event = type + "-read-" + pin;

    buffer[0] = action;
    buffer[1] = pinInt;
    buffer[2] = value;

    // register a handler for
    this.on(event, handler);

    if (!state.isReading) {
      state.isReading = true;
      state.socket.on("data", function(data) {
        processReceived(this, data);
      }.bind(this));
    }

    // Tell the board we have a new pin to read
    state.socket.write(buffer);

    return this;
  };
});

/**
 * Compatibility Shimming
 */
Spark.prototype.setSamplingInterval = function(interval) {
  var state = priv.get(this);
  var safeInterval = Math.max(Math.min(Math.pow(2, 14) - 1, interval), 10);

  priv.get(this).interval = safeInterval;

  state.socket.write(new Buffer([SAMPLE_INTERVAL].concat(to7BitBytes(safeInterval))));

  return this;
};


Spark.prototype.internalRGB = function(red, green, blue) {
  var state = priv.get(this);
  var data = [INTERNAL_RGB];
  var input, values;


  if (arguments.length === 0) {
    return Object.assign({}, state.rgb);
  }

  if (arguments.length === 1) {
    input = red;

    if (typeof input === "object") {
      if (Array.isArray(input)) {
        // internalRGB([Byte, Byte, Byte])
        values = input.slice();
      } else {
        // internalRGB({
        //   red: Byte,
        //   green: Byte,
        //   blue: Byte
        // });
        if (input !== null) {
          values = [ input.red, input.green, input.blue ];
        }
      }
    } else {

      if (typeof input === "string") {
        // internalRGB("#ffffff")
        if (input.length === 7 && input[0] === "#") {
          input = input.slice(1);
        }

        // internalRGB("ffffff")
        values = [
          parseInt(input.slice(0, 2), 16),
          parseInt(input.slice(2, 4), 16),
          parseInt(input.slice(4, 6), 16),
        ];
      }
    }
  } else {
    // internalRGB(Byte, Byte, Byte)
    values = [red, green, blue];
  }

  values = values.map(function(value) {
    return constrain(value, 0, 255);
  });

  // Update internal state
  state.rgb.red = values[0];
  state.rgb.green = values[1];
  state.rgb.blue = values[2];


  // Send buffer over wire
  state.socket.write(new Buffer(data.concat(values)));
  return this;
};

Spark.prototype.reset = function() {
  return this;
};

Spark.prototype.close = function() {
  var state = priv.get(this);
  state.socket.close();
  state.server.close();
};

function constrain(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}


module.exports = Spark;
