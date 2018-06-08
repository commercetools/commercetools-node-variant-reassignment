'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _utilsErrorToJson = require('utils-error-to-json');

var _utilsErrorToJson2 = _interopRequireDefault(_utilsErrorToJson);

var _productManager = require('../services/product-manager');

var _productManager2 = _interopRequireDefault(_productManager);

var _transactionManager = require('../services/transaction-manager');

var _transactionManager2 = _interopRequireDefault(_transactionManager);

var _constants = require('../constants');

var constants = _interopRequireWildcard(_constants);

var _logger = require('../services/logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var VariantReassignment = function () {
  function VariantReassignment(client, logger) {
    var errorCallback = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this._getDefaultErrorCallback();
    var retainExistingData = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
    (0, _classCallCheck3.default)(this, VariantReassignment);

    // When we run execute method it also fetch and process all unfinished transactions
    // but only for the first time - this is ensured by firstRun variable which is set to false
    // after first run
    this.firstRun = true;
    this.retainExistingData = retainExistingData;
    this.logger = logger;
    this.errorCallback = errorCallback;
    this.productService = new _productManager2.default(client);
    this.transactionService = new _transactionManager2.default(client);
    this.statistics = {
      anonymized: 0, // products with conflicting slugs OR backup products
      productTypeChanged: 0,
      processed: 0,
      succeeded: 0,
      retries: 0,
      errors: 0,
      processedSkus: [],
      failedSkus: []
    };
  }

  /**
   * Take a list of product drafts and existing products matched by sku
   *  - for every productDraft check if reassignment is needed
   *  - if yes, create and process actions which will move variants across products
   * @param productDrafts List of productDrafts
   * @param productTypeNameToTypeObj product type cache to resolve product type references
   * @returns {Promise.<*>} updated global statistics
   */


  (0, _createClass3.default)(VariantReassignment, [{
    key: 'execute',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(productDrafts) {
        var _statistics$failedSku;

        var productTypeNameToTypeObj = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

        var failedSkus, products, productDraftsForReassignment, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, productDraft, skus, _statistics;

        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                failedSkus = [];
                products = [];
                _context.prev = 2;

                if (!this.firstRun) {
                  _context.next = 6;
                  break;
                }

                _context.next = 6;
                return this._processUnfinishedTransactions();

              case 6:
                _context.next = 12;
                break;

              case 8:
                _context.prev = 8;
                _context.t0 = _context['catch'](2);
                _context.next = 12;
                return this._handleUnrecoverableError(_context.t0);

              case 12:
                this.firstRun = false;

                _context.prev = 13;
                _context.next = 16;
                return this.productService.fetchProductsFromProductDrafts(productDrafts);

              case 16:
                products = _context.sent;
                _context.next = 22;
                break;

              case 19:
                _context.prev = 19;
                _context.t1 = _context['catch'](13);
                return _context.abrupt('return', this._error('Error while fetching products for reassignment', _context.t1));

              case 22:

                productDrafts = this._resolveProductTypeReferences(productDrafts, productTypeNameToTypeObj);

                productDraftsForReassignment = this._selectProductDraftsForReassignment(productDrafts, products);


                this.logger.debug('Filtered ' + productDraftsForReassignment.length + ' productDrafts for reassignment');

                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                _context.prev = 28;
                _iterator = (0, _getIterator3.default)(productDraftsForReassignment);

              case 30:
                if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                  _context.next = 52;
                  break;
                }

                productDraft = _step.value;
                skus = this.productService.getProductDraftSkus(productDraft);
                _context.prev = 33;
                _context.next = 36;
                return this._processProductDraft(productDraft, products);

              case 36:
                (_statistics = this.statistics).processedSkus.apply(_statistics, (0, _toConsumableArray3.default)(skus));
                this.statistics.succeeded++;
                _context.next = 45;
                break;

              case 40:
                _context.prev = 40;
                _context.t2 = _context['catch'](33);

                failedSkus.push.apply(failedSkus, (0, _toConsumableArray3.default)(skus));
                _context.next = 45;
                return this._handleUnrecoverableError(_context.t2);

              case 45:
                _context.prev = 45;

                this.statistics.processed++;
                this.logger.debug('Finished processing of productDraft with name ' + (0, _stringify2.default)(productDraft.name));
                return _context.finish(45);

              case 49:
                _iteratorNormalCompletion = true;
                _context.next = 30;
                break;

              case 52:
                _context.next = 58;
                break;

              case 54:
                _context.prev = 54;
                _context.t3 = _context['catch'](28);
                _didIteratorError = true;
                _iteratorError = _context.t3;

              case 58:
                _context.prev = 58;
                _context.prev = 59;

                if (!_iteratorNormalCompletion && _iterator.return) {
                  _iterator.return();
                }

              case 61:
                _context.prev = 61;

                if (!_didIteratorError) {
                  _context.next = 64;
                  break;
                }

                throw _iteratorError;

              case 64:
                return _context.finish(61);

              case 65:
                return _context.finish(58);

              case 66:

                (_statistics$failedSku = this.statistics.failedSkus).push.apply(_statistics$failedSku, failedSkus);
                return _context.abrupt('return', {
                  failedSkus: failedSkus,
                  statistics: this.statistics
                });

              case 68:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this, [[2, 8], [13, 19], [28, 54, 58, 66], [33, 40, 45, 49], [59,, 61, 65]]);
      }));

      function execute(_x3) {
        return _ref.apply(this, arguments);
      }

      return execute;
    }()
  }, {
    key: '_handleUnfinishedTransactionsError',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(retryCount) {
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                this.logger.warn('Retrying(' + retryCount + ') processing of unfinished transactions');
                this.statistics.retries++;
                _context2.next = 4;
                return this._processUnfinishedTransactions(null, ++retryCount);

              case 4:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function _handleUnfinishedTransactionsError(_x5) {
        return _ref2.apply(this, arguments);
      }

      return _handleUnfinishedTransactionsError;
    }()
  }, {
    key: '_retryProcessingOfProductDraft',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(productDraft, products, retryCount) {
        var transactions, failedTransaction;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                this.logger.warn('Retrying(' + retryCount + ') processing of productDraft', productDraft);
                this.statistics.retries++;
                _context3.next = 4;
                return this.transactionService.getTransactions();

              case 4:
                transactions = _context3.sent;
                failedTransaction = transactions.find(function (_ref4) {
                  var value = _ref4.value;
                  return _lodash2.default.isEqual(value.newProductDraft.slug, productDraft.slug);
                });

                if (!failedTransaction) {
                  _context3.next = 9;
                  break;
                }

                _context3.next = 9;
                return this._processUnfinishedTransactions(transactions, ++retryCount);

              case 9:
                return _context3.abrupt('return', this._processProductDraft(productDraft, products, ++retryCount));

              case 10:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _retryProcessingOfProductDraft(_x6, _x7, _x8) {
        return _ref3.apply(this, arguments);
      }

      return _retryProcessingOfProductDraft;
    }()
  }, {
    key: '_handleUnrecoverableError',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(error) {
        var _this = this;

        var transactions;
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                error[constants.ERROR_CONTEXT] = 'Unrecoverable error, will delete backup custom object.';
                _context4.prev = 1;
                _context4.next = 4;
                return this.transactionService.getTransactions();

              case 4:
                transactions = _context4.sent;
                _context4.next = 7;
                return _bluebird2.default.map(transactions, function (transaction) {
                  return _this.transactionService.deleteTransaction(transaction.key);
                }, { concurrency: 3 });

              case 7:
                _context4.next = 12;
                break;

              case 9:
                _context4.prev = 9;
                _context4.t0 = _context4['catch'](1);

                (0, _logger2.default)('Error when deleting backup custom objects', _context4.t0);

              case 12:
                _context4.prev = 12;

                this.statistics.errors++;
                _context4.next = 16;
                return this.errorCallback(error, this.logger);

              case 16:
                return _context4.finish(12);

              case 17:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this, [[1, 9, 12, 17]]);
      }));

      function _handleUnrecoverableError(_x9) {
        return _ref5.apply(this, arguments);
      }

      return _handleUnrecoverableError;
    }()

    /**
     * Return Promise.reject
     * @param msg String with error description
     * @param e Error object with details
     * @return <Promise.reject>
     * @private
     */

  }, {
    key: '_error',
    value: function _error(msg, e) {
      var error = e instanceof Error ? (0, _utilsErrorToJson2.default)(e) : e;
      return _bluebird2.default.reject(new Error(msg + ' - ' + (0, _stringify2.default)(error)));
    }

    /**
     * Load unfinished transactions from customObject and try to finish them
     * @private
     */

  }, {
    key: '_processUnfinishedTransactions',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(transactions) {
        var retryCount = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

        var _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, transactionObject, key, transaction;

        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.prev = 0;

                if (transactions) {
                  _context5.next = 6;
                  break;
                }

                (0, _logger2.default)('Loading unfinished transactions');
                _context5.next = 5;
                return this.transactionService.getTransactions();

              case 5:
                transactions = _context5.sent;

              case 6:
                _iteratorNormalCompletion2 = true;
                _didIteratorError2 = false;
                _iteratorError2 = undefined;
                _context5.prev = 9;
                _iterator2 = (0, _getIterator3.default)(transactions);

              case 11:
                if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
                  _context5.next = 22;
                  break;
                }

                transactionObject = _step2.value;
                key = transactionObject.key, transaction = transactionObject.value;


                this.logger.debug('Processing unfinished transaction with key ' + key);
                _context5.next = 17;
                return this._createAndExecuteActions(transaction.newProductDraft, transaction.backupProductDraft, transaction.variants, transaction.ctpProductToUpdate, transactionObject);

              case 17:
                _context5.next = 19;
                return this.transactionService.deleteTransaction(key);

              case 19:
                _iteratorNormalCompletion2 = true;
                _context5.next = 11;
                break;

              case 22:
                _context5.next = 28;
                break;

              case 24:
                _context5.prev = 24;
                _context5.t0 = _context5['catch'](9);
                _didIteratorError2 = true;
                _iteratorError2 = _context5.t0;

              case 28:
                _context5.prev = 28;
                _context5.prev = 29;

                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }

              case 31:
                _context5.prev = 31;

                if (!_didIteratorError2) {
                  _context5.next = 34;
                  break;
                }

                throw _iteratorError2;

              case 34:
                return _context5.finish(31);

              case 35:
                return _context5.finish(28);

              case 36:
                _context5.next = 46;
                break;

              case 38:
                _context5.prev = 38;
                _context5.t1 = _context5['catch'](0);

                if (!(retryCount < constants.MAX_RETRIES && !this._isUnrecoverableError(_context5.t1))) {
                  _context5.next = 45;
                  break;
                }

                _context5.next = 43;
                return this._handleUnfinishedTransactionsError(retryCount);

              case 43:
                _context5.next = 46;
                break;

              case 45:
                throw _context5.t1;

              case 46:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this, [[0, 38], [9, 24, 28, 36], [29,, 31, 35]]);
      }));

      function _processUnfinishedTransactions(_x10) {
        return _ref6.apply(this, arguments);
      }

      return _processUnfinishedTransactions;
    }()
  }, {
    key: '_processProductDraft',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(productDraft, products) {
        var retryCount = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

        var matchingProducts, ctpProductToUpdate, _getRemovedVariants2, backupVariants, variantsToProcess, anonymizedProductDraft, transaction;

        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                _context6.prev = 0;

                (0, _logger2.default)('Processing reassignment for productDraft with name ' + (0, _stringify2.default)(productDraft.name));

                _context6.next = 4;
                return this._selectMatchingProducts(productDraft, products);

              case 4:
                matchingProducts = _context6.sent;

                if (!(matchingProducts.length === 0)) {
                  _context6.next = 7;
                  break;
                }

                return _context6.abrupt('return');

              case 7:

                // select using SLUG, etc..
                ctpProductToUpdate = this._selectCtpProductToUpdate(productDraft, matchingProducts);

                (0, _logger2.default)('Selected ctpProductToUpdate with id "' + ctpProductToUpdate.id + '"');

                // get variants and draft to backup
                _getRemovedVariants2 = this._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate), backupVariants = _getRemovedVariants2.matchingProductsVars, variantsToProcess = _getRemovedVariants2.ctpProductToUpdateVars;
                anonymizedProductDraft = this._createProductDraftWithRemovedVariants(ctpProductToUpdate, variantsToProcess);


                (0, _logger2.default)('Will remove ' + variantsToProcess.length + ' and reassign ' + backupVariants.length + ' variants');

                // create a backup object
                _context6.next = 14;
                return this._backupToCustomObject(productDraft, backupVariants, anonymizedProductDraft);

              case 14:
                transaction = _context6.sent;
                _context6.next = 17;
                return this._createAndExecuteActions(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts);

              case 17:
                _context6.next = 19;
                return this.transactionService.deleteTransaction(transaction.key);

              case 19:
                _context6.next = 29;
                break;

              case 21:
                _context6.prev = 21;
                _context6.t0 = _context6['catch'](0);

                if (!(retryCount < constants.MAX_RETRIES && !this._isUnrecoverableError(_context6.t0))) {
                  _context6.next = 28;
                  break;
                }

                _context6.next = 26;
                return this._retryProcessingOfProductDraft(productDraft, products, retryCount);

              case 26:
                _context6.next = 29;
                break;

              case 28:
                throw _context6.t0;

              case 29:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this, [[0, 21]]);
      }));

      function _processProductDraft(_x12, _x13) {
        return _ref7.apply(this, arguments);
      }

      return _processProductDraft;
    }()
  }, {
    key: '_createAndExecuteActions',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7(productDraft, anonymizedProductDraft, backupVariants, ctpProductToUpdate, transaction, matchingProducts) {
        var productToUpdateCandidate, ctpProductTypeId, draftProductType;
        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                if (matchingProducts) {
                  _context7.next = 12;
                  break;
                }

                _context7.next = 3;
                return this._selectMatchingProducts(productDraft);

              case 3:
                matchingProducts = _context7.sent;

                // load CTP product to update for backupProductDraft -> CTP product to update

                productToUpdateCandidate = this._selectCtpProductToUpdate(productDraft, matchingProducts);

                // if there is no ctpProductToUpdate or it is the same as candidate, take candidate

                if (!(!ctpProductToUpdate || this.productService.isProductsSame(productToUpdateCandidate, ctpProductToUpdate))) {
                  _context7.next = 9;
                  break;
                }

                ctpProductToUpdate = productToUpdateCandidate;
                _context7.next = 12;
                break;

              case 9:
                _context7.next = 11;
                return this._createNewProduct(ctpProductToUpdate, productDraft.productType.id);

              case 11:
                ctpProductToUpdate = _context7.sent;

              case 12:

                // check if product types are the same for productDraft and CTP product to update
                ctpProductTypeId = ctpProductToUpdate.productType.id;
                draftProductType = productDraft.productType.id;

                matchingProducts = matchingProducts.filter(function (product) {
                  return product.id !== ctpProductToUpdate.id;
                });

                if (!(draftProductType !== ctpProductTypeId)) {
                  _context7.next = 19;
                  break;
                }

                _context7.next = 18;
                return this._changeProductType(transaction, ctpProductToUpdate, draftProductType);

              case 18:
                ctpProductToUpdate = _context7.sent;

              case 19:
                _context7.next = 21;
                return this._removeVariantsFromMatchingProducts(backupVariants, matchingProducts);

              case 21:
                matchingProducts = _context7.sent;
                _context7.next = 24;
                return this._createVariantsInCtpProductToUpdate(backupVariants, productDraft, ctpProductToUpdate);

              case 24:
                ctpProductToUpdate = _context7.sent;

                if (!anonymizedProductDraft) {
                  _context7.next = 31;
                  break;
                }

                _context7.next = 28;
                return this._removeVariantsFromCtpProductToUpdate(anonymizedProductDraft, ctpProductToUpdate);

              case 28:
                _context7.next = 30;
                return this._ensureProductCreation(anonymizedProductDraft);

              case 30:
                this.statistics.anonymized++;

              case 31:
                _context7.next = 33;
                return this._ensureSlugUniqueness(productDraft, matchingProducts);

              case 33:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function _createAndExecuteActions(_x15, _x16, _x17, _x18, _x19, _x20) {
        return _ref8.apply(this, arguments);
      }

      return _createAndExecuteActions;
    }()

    /**
     * match by variant sku - pick CTP product that has all variants
     *                        matches product draft
     * match by slug - pick CTP product that has at least one slug language
     *                        that matches product draft slug
     * match by same masterVariant sku - pick CTP product that has same master
     *                        variant as the product draft
     * take the first CTP product
     */

  }, {
    key: '_selectCtpProductToUpdate',
    value: function _selectCtpProductToUpdate(productDraft, products) {
      var matchBySkus = this._getProductMatchByVariantSkus(productDraft, products);
      if (matchBySkus) return matchBySkus;
      var matchBySlug = this._getProductsMatchBySlug(productDraft, products);
      if (matchBySlug.length === 1) return matchBySlug[0];
      var matchByMasterVariant = this._getProductsMatchByMasterVariant(productDraft, matchBySlug);
      return matchByMasterVariant || products[0];
    }
  }, {
    key: '_getProductMatchByVariantSkus',
    value: function _getProductMatchByVariantSkus(productDraft, products) {
      var matchedProduct = null;
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = (0, _getIterator3.default)(products), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var product = _step3.value;

          var productSkus = this.productService.getProductSkus(product);
          // https://lodash.com/docs/4.17.4#xor
          if (_lodash2.default.isEmpty(_lodash2.default.xor(productDraftSkus, productSkus))) {
            matchedProduct = product;
            break;
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      return matchedProduct;
    }
  }, {
    key: '_getProductsMatchBySlug',
    value: function _getProductsMatchBySlug(productDraft, products) {
      var matchedProducts = [];
      var productDraftSlugs = productDraft.slug;
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = (0, _getIterator3.default)(products), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var product = _step4.value;
          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = (0, _getIterator3.default)((0, _entries2.default)(productDraftSlugs)), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var _step5$value = (0, _slicedToArray3.default)(_step5.value, 2),
                  lang = _step5$value[0],
                  slug = _step5$value[1];

              if (product.masterData.staged.slug[lang] === slug) {
                matchedProducts.push(product);
                break;
              }
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5.return) {
                _iterator5.return();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      return matchedProducts;
    }
  }, {
    key: '_getProductsMatchByMasterVariant',
    value: function _getProductsMatchByMasterVariant(productDraft, products) {
      var masterVariantSku = productDraft.masterVariant.sku;
      return products.find(function (p) {
        return p.masterData.staged.masterVariant.sku === masterVariantSku;
      });
    }
  }, {
    key: '_selectProductDraftsForReassignment',
    value: function _selectProductDraftsForReassignment(productDrafts, ctpProducts) {
      var _this2 = this;

      var skuToProductMap = this._createSkuToProductMap(ctpProducts);
      return productDrafts.filter(function (productDraft) {
        return _this2._isReassignmentNeeded(productDraft, skuToProductMap);
      });
    }

    /**
     * In productDrafts from external systems, there's no productTypeId, but instead the name is used.
     * However, productTypeId is needed for reassignment. This method replaces the productTypeName
     * with productTypeId if such ID exists.
     */

  }, {
    key: '_resolveProductTypeReferences',
    value: function _resolveProductTypeReferences(productDrafts, productTypeNameToTypeObj) {
      productDrafts.forEach(function (productDraft) {
        var productType = productTypeNameToTypeObj[productDraft.productType.id];
        if (productType) productDraft.productType.id = productType.id;
      });
      return productDrafts;
    }
  }, {
    key: '_createSkuToProductMap',
    value: function _createSkuToProductMap(ctpProducts) {
      var _this3 = this;

      var skuToProductMap = new _map2.default();
      ctpProducts.forEach(function (p) {
        var skus = _this3.productService.getProductSkus(p);
        skus.forEach(function (sku) {
          return skuToProductMap.set(sku, p);
        });
      });
      return skuToProductMap;
    }

    /**
     * Product draft needs reassignment in these cases:
     * 1. more than 1 product matches the draft's SKUs
     * 2. or CTP product (staged or current) does not have exact SKU match with product draft
     * 3. or product type is not the same
     * 4. or 1 product is matched by SKU and number of variants, but slug is not the same -
     * - in this case, we need to ensure there are no slug conflict with the product draft that can
     * be in a product that does not have any common SKUs
     */

  }, {
    key: '_isReassignmentNeeded',
    value: function _isReassignmentNeeded(productDraft, skuToProductMap) {
      var productSet = new _set2.default();
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      productDraftSkus.forEach(function (sku) {
        var product = skuToProductMap.get(sku);
        if (product) productSet.add(product);
      });
      if (productSet.size === 0) {
        // check for product matches by slug
        var products = (0, _from2.default)(skuToProductMap.values());
        this._selectMatchingProductsBySlug(products, productDraft).forEach(function (p) {
          return productSet.add(p);
        });
      }
      if (productSet.size === 0)
        // new product from the product draft
        return false;else if (productSet.size === 1) {
        // check if CTP product have exact SKU match with product draft
        var product = productSet.values().next().value;
        var draftSkus = this.productService.getProductDraftSkus(productDraft);
        var productSkus = this.productService.getProductSkus(product);
        if (_lodash2.default.isEqual(draftSkus.sort(), productSkus.sort())) {
          // variants are assigned correctly, maybe we need to change product type
          var productTypeId = product.productType.id;
          var productDraftTypeId = productDraft.productType.id;
          if (productTypeId === productDraftTypeId)
            // product type are correct, check if product slugs are unique
            return !_lodash2.default.isEqual(product.masterData.staged.slug, productDraft.slug);
        }
      }
      return true;
    }

    /**
     * Variants will be removed from a product for 2 reasons:
     * 1) variants will be moved to a CTP product to update from matching products
     * 2) variants needs to be removed from CTP product to update because they don't exist
     * in the new product draft anymore
     *
     * @param productDraft
     * @param matchingProducts
     * @param ctpProductToUpdate
     * @returns {{matchingProductsVariants, ctpProductToUpdateVariants}}
     * @private
     */

  }, {
    key: '_getRemovedVariants',
    value: function _getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate) {
      var _this4 = this;

      var productsToRemoveVariants = matchingProducts.filter(function (p) {
        return p !== ctpProductToUpdate;
      });
      var skus = this.productService.getProductDraftSkus(productDraft);

      // variants that needs to be moved from matching product
      var matchingProductsVariants = productsToRemoveVariants.map(function (product) {
        return _this4._selectVariantsWithCondition(product, function (variant) {
          return skus.indexOf(variant.sku) !== -1;
        });
      });

      // variants that needs to be removed from CTP product to update
      var ctpProductToUpdateVariants = this._selectVariantsWithCondition(ctpProductToUpdate, function (variant) {
        return !(skus.indexOf(variant.sku) !== -1);
      });

      return {
        matchingProductsVars: _lodash2.default.flatten(matchingProductsVariants),
        ctpProductToUpdateVars: ctpProductToUpdateVariants
      };
    }
  }, {
    key: '_selectVariantsWithCondition',
    value: function _selectVariantsWithCondition(product, condition) {
      var skuToVariantObject = this.productService.getProductVariantsMapBySku(product);
      var variants = _lodash2.default.values(skuToVariantObject);
      return variants.filter(condition);
    }
  }, {
    key: '_createProductDraftWithRemovedVariants',
    value: function _createProductDraftWithRemovedVariants(product, variantsToBackup) {
      var productDraftClone = void 0;
      if (variantsToBackup.length > 0) {
        productDraftClone = _lodash2.default.cloneDeep(product.masterData.staged);
        productDraftClone.key = product.key;
        productDraftClone.productType = product.productType;
        productDraftClone.taxCategory = product.taxCategory;
        productDraftClone.state = product.state;
        productDraftClone.reviewRatingStatistics = product.reviewRatingStatistics;
        productDraftClone.masterVariant = variantsToBackup[0];
        productDraftClone.variants = variantsToBackup.slice(1, variantsToBackup.length);
        productDraftClone = this.productService.getAnonymizedProductDraft(productDraftClone);
      }

      return productDraftClone;
    }
  }, {
    key: '_backupToCustomObject',
    value: function _backupToCustomObject(newProductDraft, variants, backupProductDraft) {
      var transaction = {
        newProductDraft: newProductDraft,
        variants: variants
      };
      if (backupProductDraft) transaction.backupProductDraft = backupProductDraft;
      return this.transactionService.createTransaction(transaction);
    }

    /**
     * Select products that has at least one variant
     * or at least one matching slug with the productDraft.
     * @param productDraft
     * @param products if present, then this will be used and no fetching from CTP is needed
     * @returns {*}
     * @private
     */

  }, {
    key: '_selectMatchingProducts',
    value: function _selectMatchingProducts(productDraft, products) {
      var productDraftSkus = this.productService.getProductDraftSkus(productDraft);
      var productDraftSlugs = productDraft.slug;
      if (products) {
        // select products that matches by at least one slug with productDraft
        var matchingProductsBySlug = this._selectMatchingProductsBySlug(products, productDraft);
        // select products that matches by at least one variant with productDraft
        var matchingProductsBySku = this._selectMatchingProductsBySkus(products, productDraftSkus);
        return this.productService.filterOutDuplicateProducts(_lodash2.default.compact(matchingProductsBySku.concat(matchingProductsBySlug)));
      }
      return this.productService.getProductsBySkusOrSlugs(productDraftSkus, productDraftSlugs);
    }

    /* eslint-disable no-labels */

  }, {
    key: '_selectMatchingProductsBySlug',
    value: function _selectMatchingProductsBySlug(products, productDraft) {
      return products.filter(function (product) {
        var _arr = ['staged', 'current'];

        for (var _i = 0; _i < _arr.length; _i++) {
          var representation = _arr[_i];
          var productSlug = product.masterData[representation].slug;
          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            for (var _iterator6 = (0, _getIterator3.default)((0, _keys2.default)(productSlug)), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var locale = _step6.value;

              if (productSlug[locale] === productDraft.slug[locale]) return true;
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }
        }
        return false;
      });
    }
    /* eslint-enable no-labels */

  }, {
    key: '_selectMatchingProductsBySkus',
    value: function _selectMatchingProductsBySkus(products, productDraftSkus) {
      var skuToProductMap = this._createSkuToProductMap(products);
      var matchingProducts = productDraftSkus.map(function (sku) {
        return skuToProductMap.get(sku);
      });
      return _lodash2.default.compact(matchingProducts);
    }
  }, {
    key: '_createNewProduct',
    value: function _createNewProduct(product, productTypeId) {
      product.productType.id = productTypeId;

      var projection = this.productService.transformProductToProjection(product);
      projection.productType.id = productTypeId;
      return this.productService.createProduct(projection);
    }
  }, {
    key: '_ensureProductCreation',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(productDraft) {
        var sku, existingProducts;
        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                sku = productDraft.masterVariant.sku;
                _context8.next = 3;
                return this.productService.getProductsBySkus([sku]);

              case 3:
                existingProducts = _context8.sent;

                if (existingProducts.length) {
                  _context8.next = 7;
                  break;
                }

                _context8.next = 7;
                return this.productService.createProduct(productDraft);

              case 7:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function _ensureProductCreation(_x21) {
        return _ref9.apply(this, arguments);
      }

      return _ensureProductCreation;
    }()

    /**
     * Create a backup of a product because we need to do product type change for this product
     */

  }, {
    key: '_backupProductForProductTypeChange',
    value: function () {
      var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9(transactionObject, ctpProductToUpdate) {
        var transactionKey, transaction;
        return _regenerator2.default.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                if (transactionObject.ctpProductToUpdate) {
                  _context9.next = 8;
                  break;
                }

                transactionKey = transactionObject.key;
                _context9.next = 4;
                return this.transactionService.getTransaction(transactionKey);

              case 4:
                transaction = _context9.sent;

                transaction.ctpProductToUpdate = ctpProductToUpdate;

                _context9.next = 8;
                return this.transactionService.upsertTransactionByKey(transaction, transactionKey);

              case 8:
              case 'end':
                return _context9.stop();
            }
          }
        }, _callee9, this);
      }));

      function _backupProductForProductTypeChange(_x22, _x23) {
        return _ref10.apply(this, arguments);
      }

      return _backupProductForProductTypeChange;
    }()
  }, {
    key: '_changeProductType',
    value: function () {
      var _ref11 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee10(transaction, ctpProductToUpdate, productTypeId) {
        var updatedProduct;
        return _regenerator2.default.wrap(function _callee10$(_context10) {
          while (1) {
            switch (_context10.prev = _context10.next) {
              case 0:
                (0, _logger2.default)('Changing productType of product ' + ((0, _stringify2.default)(ctpProductToUpdate.masterData.current.name) + ' with id ') + ('"' + ctpProductToUpdate.id + '" to productType "' + productTypeId + '"'));

                _context10.next = 3;
                return this._backupProductForProductTypeChange(transaction, ctpProductToUpdate);

              case 3:
                _context10.next = 5;
                return this.productService.changeProductType(ctpProductToUpdate, productTypeId);

              case 5:
                updatedProduct = _context10.sent;
                _context10.next = 8;
                return this._deleteBackupForProductTypeChange(transaction.key);

              case 8:
                this.statistics.productTypeChanged++;
                return _context10.abrupt('return', updatedProduct);

              case 10:
              case 'end':
                return _context10.stop();
            }
          }
        }, _callee10, this);
      }));

      function _changeProductType(_x24, _x25, _x26) {
        return _ref11.apply(this, arguments);
      }

      return _changeProductType;
    }()

    /**
     * Delete a backup that was created because of product type change of a product
     */

  }, {
    key: '_deleteBackupForProductTypeChange',
    value: function () {
      var _ref12 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee11(transactionKey) {
        var transaction;
        return _regenerator2.default.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                _context11.next = 2;
                return this.transactionService.getTransaction(transactionKey);

              case 2:
                transaction = _context11.sent;

                delete transaction.ctpProductToUpdate;
                _context11.next = 6;
                return this.transactionService.upsertTransactionByKey(transaction, transactionKey);

              case 6:
              case 'end':
                return _context11.stop();
            }
          }
        }, _callee11, this);
      }));

      function _deleteBackupForProductTypeChange(_x27) {
        return _ref12.apply(this, arguments);
      }

      return _deleteBackupForProductTypeChange;
    }()

    /**
     * Verify that there are no other products in the platform that has slugs of productDraft
     * except ctpProductToUpdate. It's enough to check matchingProducts because it's not probable
     * that there will be a product which has no matching variant, but a conflicting slug.
     *
     * @see variant-reassignment-example-7.spec.js
     */

  }, {
    key: '_ensureSlugUniqueness',
    value: function () {
      var _ref13 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee12(productDraft, matchingProducts) {
        var _this5 = this;

        var productDraftSlug, productsToAnonymize;
        return _regenerator2.default.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                productDraftSlug = productDraft.slug;
                productsToAnonymize = matchingProducts.filter(function (product) {
                  return _this5._isSlugConflicting(product, productDraftSlug);
                });


                (0, _logger2.default)('Anonymizing ' + productsToAnonymize.length + ' products because of duplicate slugs');

                _context12.next = 5;
                return _bluebird2.default.map(productsToAnonymize, function (product) {
                  return _this5.productService.anonymizeCtpProduct(product);
                }, { concurrency: 3 });

              case 5:
                this.statistics.anonymized += productsToAnonymize.length;

              case 6:
              case 'end':
                return _context12.stop();
            }
          }
        }, _callee12, this);
      }));

      function _ensureSlugUniqueness(_x28, _x29) {
        return _ref13.apply(this, arguments);
      }

      return _ensureSlugUniqueness;
    }()

    /**
     * The slugs from product and product draft are conflicting when at least one language value
     * from product's slug is the same as in product draft slug
     * @param product
     * @param productDraftSlug
     * @returns {boolean}
     * @private
     */

  }, {
    key: '_isSlugConflicting',
    value: function _isSlugConflicting(product, productDraftSlug) {
      var productDraftSlugLength = (0, _keys2.default)(productDraftSlug).length;

      // if at least one version has conflict in slugs, return true
      var _arr2 = ['staged', 'current'];

      var _loop = function _loop() {
        var version = _arr2[_i2];
        var slug = product.masterData[version].slug;
        var slugLength = (0, _keys2.default)(slug).length;
        var stagedDraftSlugs = _lodash2.default.merge({}, productDraftSlug, slug);
        var stagedDraftSlugsLength = (0, _keys2.default)(stagedDraftSlugs).length;

        var hasSameSlugLang = slugLength + productDraftSlugLength !== stagedDraftSlugsLength;
        var hasAnySameSlugValue = (0, _keys2.default)(slug).some(function (lang) {
          return productDraftSlug[lang] === slug[lang];
        });
        if (hasSameSlugLang && hasAnySameSlugValue) return {
            v: true
          };
      };

      for (var _i2 = 0; _i2 < _arr2.length; _i2++) {
        var _ret = _loop();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
      }
      return false;
    }
  }, {
    key: '_removeVariantsFromCtpProductToUpdate',
    value: function () {
      var _ref14 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee13(anonymizedProductDraft, ctpProductToUpdate) {
        var skusToRemove;
        return _regenerator2.default.wrap(function _callee13$(_context13) {
          while (1) {
            switch (_context13.prev = _context13.next) {
              case 0:
                skusToRemove = this.productService.getProductDraftSkus(anonymizedProductDraft);
                _context13.next = 3;
                return this.productService.removeVariantsFromProduct(ctpProductToUpdate, skusToRemove);

              case 3:
              case 'end':
                return _context13.stop();
            }
          }
        }, _callee13, this);
      }));

      function _removeVariantsFromCtpProductToUpdate(_x30, _x31) {
        return _ref14.apply(this, arguments);
      }

      return _removeVariantsFromCtpProductToUpdate;
    }()
  }, {
    key: '_createVariantsInCtpProductToUpdate',
    value: function () {
      var _ref15 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee14(backupVariants, productDraft, ctpProductToUpdate) {
        var _this6 = this;

        var actions, skuToVariant, existingSkus, variants, setAttrActions, _iteratorNormalCompletion7, _didIteratorError7, _iteratorError7, _iterator7, _step7, _step7$value, sku, variant;

        return _regenerator2.default.wrap(function _callee14$(_context14) {
          while (1) {
            switch (_context14.prev = _context14.next) {
              case 0:
                actions = [];
                skuToVariant = new _map2.default();
                existingSkus = this.productService.getProductSkus(ctpProductToUpdate);
                variants = productDraft.variants || [];

                variants.concat(productDraft.masterVariant).forEach(function (v) {
                  if (!(existingSkus.indexOf(v.sku) !== -1)) skuToVariant.set(v.sku, v);
                });
                // preserve existing attribute data
                if (!_lodash2.default.isEmpty(this.retainExistingData)) backupVariants.forEach(function (backupVariant) {
                  var draftVariant = skuToVariant.get(backupVariant.sku);
                  _this6.retainExistingData.forEach(function (attrName) {
                    // https://lodash.com/docs/4.17.4#at
                    var retainedAttr = _lodash2.default.at(backupVariant, attrName);
                    if (retainedAttr.length > 0) draftVariant[attrName] = retainedAttr[0];
                  });
                });

                // ensure sameForAll constraint
                _context14.next = 8;
                return this._ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft);

              case 8:
                setAttrActions = _context14.sent;

                actions.push.apply(actions, (0, _toConsumableArray3.default)(setAttrActions));

                // create addVariant actions
                _iteratorNormalCompletion7 = true;
                _didIteratorError7 = false;
                _iteratorError7 = undefined;
                _context14.prev = 13;
                for (_iterator7 = (0, _getIterator3.default)(skuToVariant); !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                  _step7$value = (0, _slicedToArray3.default)(_step7.value, 2), sku = _step7$value[0], variant = _step7$value[1];

                  actions.push({
                    action: 'addVariant',
                    sku: sku,
                    key: variant.key,
                    prices: variant.prices,
                    images: variant.images,
                    attributes: variant.attributes
                  });
                }_context14.next = 21;
                break;

              case 17:
                _context14.prev = 17;
                _context14.t0 = _context14['catch'](13);
                _didIteratorError7 = true;
                _iteratorError7 = _context14.t0;

              case 21:
                _context14.prev = 21;
                _context14.prev = 22;

                if (!_iteratorNormalCompletion7 && _iterator7.return) {
                  _iterator7.return();
                }

              case 24:
                _context14.prev = 24;

                if (!_didIteratorError7) {
                  _context14.next = 27;
                  break;
                }

                throw _iteratorError7;

              case 27:
                return _context14.finish(24);

              case 28:
                return _context14.finish(21);

              case 29:
                (0, _logger2.default)('Updating ctpProductToUpdate with ' + actions.length + ' addVariant actions');
                return _context14.abrupt('return', this.productService.updateProduct(ctpProductToUpdate, actions));

              case 31:
              case 'end':
                return _context14.stop();
            }
          }
        }, _callee14, this, [[13, 17, 21, 29], [22,, 24, 28]]);
      }));

      function _createVariantsInCtpProductToUpdate(_x32, _x33, _x34) {
        return _ref15.apply(this, arguments);
      }

      return _createVariantsInCtpProductToUpdate;
    }()
  }, {
    key: '_ensureSameForAllAttributes',
    value: function _ensureSameForAllAttributes(ctpProductToUpdate, skuToVariant, productDraft) {
      var variantsToEnsure = [ctpProductToUpdate.masterData.staged.masterVariant].concat(ctpProductToUpdate.masterData.staged.variants).concat((0, _from2.default)(skuToVariant.values()));

      return this.productService.ensureSameForAllAttributes(variantsToEnsure, productDraft.productType.id, productDraft);
    }
  }, {
    key: '_removeVariantsFromMatchingProducts',
    value: function () {
      var _ref16 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee15(backupVariants, matchingProducts) {
        var _this7 = this;

        var productToSkusToRemoveMap, skuToProductMap, _iteratorNormalCompletion8, _didIteratorError8, _iteratorError8, _iterator8, _step8, variant, product, actions;

        return _regenerator2.default.wrap(function _callee15$(_context15) {
          while (1) {
            switch (_context15.prev = _context15.next) {
              case 0:
                if (backupVariants.length) {
                  _context15.next = 2;
                  break;
                }

                return _context15.abrupt('return', matchingProducts);

              case 2:
                productToSkusToRemoveMap = new _map2.default();
                skuToProductMap = matchingProducts.reduce(function (resultMap, p) {
                  _this7.productService.getProductVariants(p).forEach(function (v) {
                    resultMap.set(v.sku, p);
                  });
                  return resultMap;
                }, new _map2.default());
                _iteratorNormalCompletion8 = true;
                _didIteratorError8 = false;
                _iteratorError8 = undefined;
                _context15.prev = 7;


                for (_iterator8 = (0, _getIterator3.default)(backupVariants); !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                  variant = _step8.value;
                  product = skuToProductMap.get(variant.sku);
                  actions = productToSkusToRemoveMap.get(product) || [];

                  // if there is a product from where we can delete variant..

                  if (product) {
                    actions.push(variant.sku);
                    productToSkusToRemoveMap.set(product, actions);
                  }
                }

                _context15.next = 15;
                break;

              case 11:
                _context15.prev = 11;
                _context15.t0 = _context15['catch'](7);
                _didIteratorError8 = true;
                _iteratorError8 = _context15.t0;

              case 15:
                _context15.prev = 15;
                _context15.prev = 16;

                if (!_iteratorNormalCompletion8 && _iterator8.return) {
                  _iterator8.return();
                }

              case 18:
                _context15.prev = 18;

                if (!_didIteratorError8) {
                  _context15.next = 21;
                  break;
                }

                throw _iteratorError8;

              case 21:
                return _context15.finish(18);

              case 22:
                return _context15.finish(15);

              case 23:
                (0, _logger2.default)('Removing variants from matching products');
                return _context15.abrupt('return', _bluebird2.default.map((0, _from2.default)(productToSkusToRemoveMap), function (_ref17) {
                  var _ref18 = (0, _slicedToArray3.default)(_ref17, 2),
                      product = _ref18[0],
                      skus = _ref18[1];

                  return _this7.productService.removeVariantsFromProduct(product, skus);
                }, { concurrency: 3 }).then(_lodash2.default.compact));

              case 25:
              case 'end':
                return _context15.stop();
            }
          }
        }, _callee15, this, [[7, 11, 15, 23], [16,, 18, 22]]);
      }));

      function _removeVariantsFromMatchingProducts(_x35, _x36) {
        return _ref16.apply(this, arguments);
      }

      return _removeVariantsFromMatchingProducts;
    }()
  }, {
    key: '_getDefaultErrorCallback',
    value: function _getDefaultErrorCallback() {
      return function (error, logger) {
        var errorObj = error instanceof Error ? (0, _utilsErrorToJson2.default)(error) : error;
        logger.error('Error during reassignment - skipping productDraft.', _util2.default.inspect(errorObj, false, null));
        return _bluebird2.default.resolve();
      };
    }
  }, {
    key: '_isUnrecoverableError',
    value: function _isUnrecoverableError(error) {
      return [400, 404].indexOf(error.statusCode) !== -1;
    }
  }]);
  return VariantReassignment;
}();

exports.default = VariantReassignment;