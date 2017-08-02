'use strict';

// https://tools.ietf.org/html/rfc1055
// A NONSTANDARD FOR TRANSMISSION OF IP DATAGRAMS OVER SERIAL LINES: SLIP

/**
 * Dependencies
 */
var SerialPort = require("serialport")
    , util = require('util')
    , SLIPMessage = require('./slip-message.js')
    , _ = require('lodash')
    , defaultProtocolDefinition = {
        messageMaxLength: 256,
        endByte: 192,
        escapeByte: 219,
        escapeRules: [
        {
          initialFragment: 192,
          replacement: 220
        },
        {
          initialFragment: 219,
          replacement: 221
        }
      ]
    }

/**
 * @param {String} path           path to serial port
 * @param {Object} options        options object
 * @param {Object} protocol       protocol definition object
 * @constructor
 */
var SLIP = function (path, options, protocol) {
  var that = this
  //super constructor call
  SerialPort.call(this, path, options)
  protocol = _.defaults(protocol ? protocol : {}, defaultProtocolDefinition)
  SLIPMessage.applyProtocol(protocol)
  this.protocol_ = protocol
  this.endByte_ = new Buffer.from([protocol.endByte])
  // register on data handler
  this.on('data', function (data) {
    that.collectDataAndFireMessageEvent_(data)
  })
}

util.inherits(SLIP, SerialPort)

SLIP.prototype.sendFlush = function () {
  this.write(this.endByte_);
}

/**
 * Sends message to device
 * @param  {String}   data     Data array that need to be sent
 * @param  {Function} callback This will fire after sending
 */
SLIP.prototype.sendMessage = function (buffer, callback) {
  var that = this;
  var message = Buffer.concat([new SLIPMessage(buffer), that.endByte_]);
  this.write(message, callback);
}

/**
 * Sends message to device, waiting for all data to be transmitted to the
 * serial port before calling the callback.
 * @param  {String}   data     Data array that need to be sent
 * @param  {Function} callback This will fire after sending
 */
SLIP.prototype.sendMessageAndDrain = function (buffer, callback) {
  var that = this;
  var message = Buffer.concat([new SLIPMessage(buffer), that.endByte_]);
  this.write(message, function (err) {
    if (err) return callback(err);
    this.drain(callback);
  });
}

/**
 * Stores recieved bytes to a temporary array till endByte
 * appears in the chunk then fires 'message' event
 * @private
 * @param  {Buffer}   data
 */
SLIP.prototype.collectDataAndFireMessageEvent_ = (function () {
  var temporaryBuffer = new Buffer.allocUnsafe((1024 * 10))
      , writeCursor = 0;

  return function (data) {
    do {
      var endIndex = data.indexOf(this.endByte_);
      if (endIndex === -1) {
        // chunk has no endByte, pushing it to temporary buffer
        writeCursor += data.copy(temporaryBuffer, writeCursor);
        return; // while loop
      } else {
        if (endIndex > 0) {
          //chunk has data before endByte
          writeCursor += data.copy(temporaryBuffer, writeCursor, 0, endIndex);
        }
        if (writeCursor > 0) {
          //copy data from temporary buffer to a new buffer and fire 'message'
          var messageBuffer = new Buffer.allocUnsafe(writeCursor);
          temporaryBuffer.copy(messageBuffer, 0, 0, writeCursor);
          var msg = SLIPMessage.unescape(messageBuffer);
          if (msg) {
            this.emit('message', msg)
          }
        }
        writeCursor = 0;
        if ((data.length - 1) > endIndex) {
          //if has data after endByte
          data = data.slice((endIndex + 1), data.length);
        } else {
          return; // while loop
        }
      }
    } while (true)
  }
})()

module.exports = SLIP
