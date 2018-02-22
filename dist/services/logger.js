'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _utilsErrorToJson = require('utils-error-to-json');

var _utilsErrorToJson2 = _interopRequireDefault(_utilsErrorToJson);

var _v = require('uuid/v1');

var _v2 = _interopRequireDefault(_v);

var _sphereNodeUtils = require('sphere-node-utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function (scope, logLevel) {
  var logger = new _sphereNodeUtils.Logger({
    name: scope,
    levelStream: process.env.LOG_LEVEL || logLevel || 'info'
  });

  logger.fields.uuid = (0, _v2.default)().substr(0, 13);
  logger.logError = function logError(error) {
    var customMsg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    var details = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    if (_lodash2.default.isString(error)) return this.error(error);

    var msg = customMsg;
    error = error instanceof Error ? (0, _utilsErrorToJson2.default)(error) : error;
    return this.error(_lodash2.default.merge(details, { error: error }), msg);
  };

  logger.extend = function extend() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var childLogger = logger.child.apply(this, args);

    childLogger.logError = logger.logError;
    childLogger.extend = logger.extend;
    return childLogger;
  };

  return logger;
};