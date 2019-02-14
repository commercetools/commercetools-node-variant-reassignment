'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _constants = require('../constants');

var constants = _interopRequireWildcard(_constants);

var _logger = require('../services/logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * This service provides methods for working with transactions.
 * Transaction is an object saved in CTP customObjects and contains information
 * about variant reassignment process. If the reassignment fails we use
 * transaction to recover modified product and its variants.
 */
var TransactionManager = function () {
  function TransactionManager(client) {
    (0, _classCallCheck3.default)(this, TransactionManager);

    this.client = client;
  }

  (0, _createClass3.default)(TransactionManager, [{
    key: 'createTransaction',
    value: function createTransaction(transaction) {
      return this.upsertTransactionByKey(transaction, '' + +new Date());
    }
  }, {
    key: 'upsertTransactionByKey',
    value: function upsertTransactionByKey(value, key) {
      var customObject = {
        container: constants.TRANSACTION_CONTAINER,
        key: key,
        value: value
      };

      return this.client.customObjects.create(customObject).then(function (res) {
        return res.body;
      });
    }
  }, {
    key: 'getTransaction',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(key) {
        var transactionObject;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return this.getTransactionObject(key);

              case 2:
                transactionObject = _context.sent;
                return _context.abrupt('return', transactionObject && transactionObject.value);

              case 4:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function getTransaction(_x) {
        return _ref.apply(this, arguments);
      }

      return getTransaction;
    }()
  }, {
    key: 'getTransactionObject',
    value: function getTransactionObject(key) {
      var predicate = 'container = "' + constants.TRANSACTION_CONTAINER + '"' + (' AND key = "' + key + '"');

      return this.client.customObjects.where(predicate).fetch().then(function (res) {
        return res.body.results[0];
      });
    }
  }, {
    key: 'getTransactions',
    value: function getTransactions() {
      var predicate = 'container = "' + constants.TRANSACTION_CONTAINER + '"';

      return this.client.customObjects.where(predicate).fetch().then(function (res) {
        return res.body.results;
      });
    }
  }, {
    key: 'deleteTransaction',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(key) {
        var transaction;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                (0, _logger2.default)('Removing transaction with key "' + key + '"');
                _context2.next = 3;
                return this.getTransactionObject(key);

              case 3:
                transaction = _context2.sent;

                if (!transaction) {
                  _context2.next = 6;
                  break;
                }

                return _context2.abrupt('return', this.client.customObjects.byId(transaction.id).delete(transaction.version));

              case 6:
                return _context2.abrupt('return', _bluebird2.default.resolve());

              case 7:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function deleteTransaction(_x2) {
        return _ref2.apply(this, arguments);
      }

      return deleteTransaction;
    }()
  }]);
  return TransactionManager;
}();

exports.default = TransactionManager;