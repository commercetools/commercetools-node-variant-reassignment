'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _constants = require('../constants');

var constants = _interopRequireWildcard(_constants);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * This service provides methods for working with transactions.
 * Transaction is an object saved in CTP customObjects and contains information
 * about variant reassignment process. If the reassignment fails we use
 * transaction to recover modified product and its variants.
 */
var TransactionManager = function () {
  function TransactionManager(logger, client) {
    (0, _classCallCheck3.default)(this, TransactionManager);

    this.client = client;
    if (logger.child) this.logger = logger.child({ service: 'transactionManager' });else this.logger = logger;
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
    value: async function getTransaction(key) {
      var transactionObject = await this.getTransactionObject(key);
      return transactionObject && transactionObject.value;
    }
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
    value: async function deleteTransaction(key) {
      this.logger.debug('Removing transaction with key "%s"', key);
      var transaction = await this.getTransactionObject(key);

      if (transaction) return this.client.customObjects.byId(transaction.id).delete(transaction.version);

      return _bluebird2.default.resolve();
    }
  }]);
  return TransactionManager;
}();

exports.default = TransactionManager;