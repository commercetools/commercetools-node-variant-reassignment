'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _values = require('babel-runtime/core-js/object/values');

var _values2 = _interopRequireDefault(_values);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _shortid = require('shortid');

var _shortid2 = _interopRequireDefault(_shortid);

var _constants = require('../constants');

var constant = _interopRequireWildcard(_constants);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ProductManager = function () {
  function ProductManager(logger, client) {
    (0, _classCallCheck3.default)(this, ProductManager);

    this.client = client;
    if (logger.child) this.logger = logger.child({ service: 'productManager' });else this.logger = logger;
    this.productTypeCache = new _map2.default();

    this.loadBatchCount = 20;
    this.loadConcurrency = 2;
  }

  (0, _createClass3.default)(ProductManager, [{
    key: 'createProduct',
    value: function createProduct(product) {
      this.logger.debug('Creating product: %j', product);

      return this.client.products.create(product).then(function (res) {
        return res.body;
      });
    }
  }, {
    key: 'publishProduct',
    value: function publishProduct(product) {
      if (this._isProductPublished(product) && !this._hasProductChanges(product)) return _bluebird2.default.resolve(product);

      var actions = [{
        action: 'publish'
      }];

      return this.updateProduct(product, actions);
    }
  }, {
    key: 'updateProduct',
    value: function updateProduct(product, actions) {
      var request = {
        version: product.version,
        actions: actions
      };

      return this.client.products.byId(product.id).update(request).then(function (res) {
        return res.body;
      });
    }
  }, {
    key: 'transformProductToProjection',
    value: function transformProductToProjection(product) {
      var staged = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

      var productLevelFields = ['id', 'key', 'version', 'createdAt', 'catalogData', 'lastModifiedAt', 'productType', 'taxCategory', 'state', 'reviewRatingStatistics'];

      var masterLevelFields = ['published', 'hasStagedChanges'];

      var projection = _lodash2.default.cloneDeep(product.masterData[staged ? 'staged' : 'current']);
      _lodash2.default.merge(projection, _lodash2.default.pick(product, productLevelFields));
      _lodash2.default.merge(projection, _lodash2.default.pick(product.masterData, masterLevelFields));
      return _lodash2.default.cloneDeep(projection);
    }
  }, {
    key: 'getProductsBySkus',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(skus) {
        var _this = this;

        var skuChunks, productBatches;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                // filter out duplicates and divide skus into chunks
                skuChunks = this._createChunks(skus);
                _context.next = 3;
                return _bluebird2.default.map(skuChunks, function (skuChunk) {
                  return _this._getProductsBySkuChunk(skuChunk);
                }, { concurrency: this.loadConcurrency // load products with concurrency
                });

              case 3:
                productBatches = _context.sent;
                return _context.abrupt('return', this._filterOutDuplicateProducts(_lodash2.default.flatten(productBatches)));

              case 5:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function getProductsBySkus(_x2) {
        return _ref.apply(this, arguments);
      }

      return getProductsBySkus;
    }()
  }, {
    key: 'getProductsBySkusOrSlugs',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(skus, slugs) {
        var _this2 = this;

        var skuChunks, slugChunks, productBatches;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                // filter out duplicates and divide skus into chunks
                skuChunks = this._createChunks(skus);
                slugChunks = this._createChunks(slugs);
                _context2.next = 4;
                return _bluebird2.default.map(skuChunks, function (skuChunk, i) {
                  var slugChunk = slugChunks[i];
                  return _this2._getProductsBySkuOrSlugChunk(skuChunk, slugChunk);
                }, { concurrency: this.loadConcurrency // load products with concurrency
                });

              case 4:
                productBatches = _context2.sent;
                return _context2.abrupt('return', this._filterOutDuplicateProducts(_lodash2.default.flatten(productBatches)));

              case 6:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function getProductsBySkusOrSlugs(_x3, _x4) {
        return _ref2.apply(this, arguments);
      }

      return getProductsBySkusOrSlugs;
    }()
  }, {
    key: '_createChunks',
    value: function _createChunks(value) {
      return (0, _lodash2.default)(value).uniq().chunk(this.loadBatchCount).value();
    }
  }, {
    key: '_filterOutDuplicateProducts',
    value: function _filterOutDuplicateProducts(products) {
      return _lodash2.default.uniqBy(products, 'id');
    }
  }, {
    key: '_getProductsBySkuChunk',
    value: function _getProductsBySkuChunk(skus) {
      var skusPredicate = this._getSkusPredicate(skus);
      var predicate = 'masterData(current(' + skusPredicate + ') or staged(' + skusPredicate + '))';

      return this._fetchProductsByPredicate(predicate);
    }
  }, {
    key: '_getProductsBySkuOrSlugChunk',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(skus) {
        var _this3 = this;

        var slugs = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

        var fetchBySlugPromise, slugPredicate, skusPredicate, fetchBySkusPromise, _ref6, _ref7, productsBySkus, productsBySlug;

        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                fetchBySlugPromise = _bluebird2.default.resolve([]);

                if (slugs.length) {
                  slugPredicate = slugs.map(function (slug) {
                    return (0, _entries2.default)(slug).map(function (_ref4) {
                      var _ref5 = (0, _slicedToArray3.default)(_ref4, 2),
                          locale = _ref5[0],
                          value = _ref5[1];

                      return locale + '=' + _this3._escapeValue(value);
                    }).join(' or ');
                  }).join(' or ');

                  fetchBySlugPromise = this._fetchProductsByPredicate('masterData(current(slug(' + slugPredicate + ')) or staged(slug(' + slugPredicate + ')))');
                }

                skusPredicate = 'masterData(current(' + this._getSkusPredicate(skus) + ') ' + ('or staged(' + this._getSkusPredicate(skus) + '))');
                fetchBySkusPromise = this._fetchProductsByPredicate(skusPredicate);
                _context3.next = 6;
                return _bluebird2.default.all([fetchBySkusPromise, fetchBySlugPromise]);

              case 6:
                _ref6 = _context3.sent;
                _ref7 = (0, _slicedToArray3.default)(_ref6, 2);
                productsBySkus = _ref7[0];
                productsBySlug = _ref7[1];
                return _context3.abrupt('return', this._filterOutDuplicateProducts([].concat((0, _toConsumableArray3.default)(_lodash2.default.compact(productsBySkus)), (0, _toConsumableArray3.default)(_lodash2.default.compact(productsBySlug)))));

              case 11:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function _getProductsBySkuOrSlugChunk(_x5) {
        return _ref3.apply(this, arguments);
      }

      return _getProductsBySkuOrSlugChunk;
    }()
  }, {
    key: '_fetchProductsByPredicate',
    value: function _fetchProductsByPredicate(predicate) {
      return this.client.products.where(predicate).fetch().then(function (res) {
        return res.body.results;
      });
    }
  }, {
    key: 'getProductById',
    value: function getProductById(id) {
      return this.client.products.byId(id).fetch().then(function (res) {
        return res.body;
      }).catch(function (err) {
        return err && err.body && err.body.statusCode === 404 ? _bluebird2.default.resolve(undefined) : _bluebird2.default.reject(err);
      });
    }
  }, {
    key: '_getSkusPredicate',
    value: function _getSkusPredicate(skus) {
      var _this4 = this;

      var skuPredicate = skus.map(function (sku) {
        return _this4._escapeValue(sku);
      }).join(',');
      return 'masterVariant(sku IN(' + skuPredicate + ')) ' + ('or variants(sku IN(' + skuPredicate + '))');
    }
  }, {
    key: '_escapeValue',
    value: function _escapeValue(value) {
      return (0, _stringify2.default)(value);
    }
  }, {
    key: 'getProductProjectionById',
    value: function getProductProjectionById(id) {
      return this.client.productProjections.staged(true).byId(id).fetch().then(function (res) {
        return res.body;
      }).catch(function (err) {
        return err && err.body && err.body.statusCode === 404 ? _bluebird2.default.resolve(undefined) : _bluebird2.default.reject(err);
      });
    }
  }, {
    key: 'deleteByProductId',
    value: function () {
      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(id) {
        var product;
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                _context4.next = 2;
                return this.getProductById(id);

              case 2:
                product = _context4.sent;
                return _context4.abrupt('return', product ? this.deleteByProduct(product) : _bluebird2.default.resolve());

              case 4:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function deleteByProductId(_x7) {
        return _ref8.apply(this, arguments);
      }

      return deleteByProductId;
    }()
  }, {
    key: 'deleteByProduct',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(product) {
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                if (!this._isProductPublished(product)) {
                  _context5.next = 4;
                  break;
                }

                _context5.next = 3;
                return this._unpublishProduct(product);

              case 3:
                product = _context5.sent;

              case 4:
                return _context5.abrupt('return', this.client.products.byId(product.id).delete(product.version).return(null));

              case 5:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function deleteByProduct(_x8) {
        return _ref9.apply(this, arguments);
      }

      return deleteByProduct;
    }()

    /**
     * Function accepts product with staged and current version and a list of SKUs
     * which will be deleted from a product. It creates and executes actions in
     * this order:
     *  - delete product if all variants are being removed
     *  - unpublish product if all current variants are being removed
     *  - add variants from current to staged if there won't be any staged
     *    variants left and vice versa
     *  - change masterVariant to another variant if we are removing masterVariant
     *  - remove selected variants
     * @param product Product object
     * @param skus List of SKUs
     */

  }, {
    key: 'removeVariantsFromProduct',
    value: function removeVariantsFromProduct(product, skus) {
      var _this5 = this;

      var masterData = product.masterData;
      var actions = [];
      var unpublishProduct = false;

      masterData.current.variants = masterData.current.variants || [];
      masterData.staged.variants = masterData.staged.variants || [];

      var productVersions = {
        current: this._getVariantsBySkuMap(masterData.current),
        staged: this._getVariantsBySkuMap(masterData.staged)
      };

      var deletedSkus = {
        current: [],
        staged: []

        // delete from map all variants specified in skus param
      };(0, _keys2.default)(productVersions).forEach(function (version) {
        return skus.forEach(function (sku) {
          if (productVersions[version][sku]) {
            delete productVersions[version][sku];
            deletedSkus[version].push(sku);
          }
        });
      });

      var retainedSkus = {
        staged: (0, _keys2.default)(productVersions.staged),
        current: (0, _keys2.default)(productVersions.current)

        // if there are no variants left delete whole product
      };if (retainedSkus.current.length === 0 && retainedSkus.staged.length === 0) return this.deleteByProduct(product);

      // if there are no variants left in current:
      //  - publish product so we get staged variants to current
      //  - set unpublish flag so the product is unpublished at the end
      if (retainedSkus.current.length === 0) {
        actions.push(this._getPublishAction());

        // we copied variants from staged to current so we should
        // update also local maps
        deletedSkus.current = _lodash2.default.cloneDeep(deletedSkus.staged);
        retainedSkus.current = _lodash2.default.cloneDeep(retainedSkus.staged);
        productVersions.current = _lodash2.default.cloneDeep(productVersions.staged);
        masterData.current = _lodash2.default.cloneDeep(masterData.staged);
        // unpublish at the end
        unpublishProduct = true;
      }

      // if there are no staged variants left
      //  - add all variants from current to staged
      if (retainedSkus.staged.length === 0) {
        retainedSkus.staged = _lodash2.default.cloneDeep(retainedSkus.current);
        productVersions.staged = _lodash2.default.cloneDeep(productVersions.current);

        retainedSkus.staged.forEach(function (sku) {
          return actions.push(_this5._getAddVariantAction(productVersions.current[sku], true));
        });
      }

      // run through both variants (staged and current)
      // first change masterVariants if needed and then remove variants
      ['staged', 'current'].forEach(function (version) {
        var variantMap = _this5._getVariantsBySkuMap(masterData[version]);

        // if we deleted a masterVariant, set another variant as new masterVariant
        if (_this5._isMasterVariantRemoved(masterData[version], retainedSkus[version])) {
          var firstExistingVariant = (0, _values2.default)(productVersions[version])[0];

          actions.push(_this5._getChangeMasterVariantAction(firstExistingVariant, version === 'staged'));
        }

        // remove variants specified in skus param
        // but only if product has this variant
        deletedSkus[version].forEach(function (sku) {
          if (variantMap[sku]) actions.push(_this5._getRemoveVariantAction(variantMap[sku], version === 'staged'));
        });
      });

      if (unpublishProduct) actions.push(this._getUnpublishAction());

      return actions.length ? this.updateProduct(product, actions) : _bluebird2.default.resolve(product);
    }

    /**
     * Method will take a product with variants which should be anonymized.
     * It will modify slug, key and name so the product can be created without
     * issues with duplicate fields
     * @param product productDraft
     */

  }, {
    key: 'getAnonymizedProductDraft',
    value: function getAnonymizedProductDraft(product) {
      var salt = this._getSalt();

      // make all languages in slug unique
      for (var lang in product.slug) {
        // eslint-disable-line guard-for-in
        product.slug[lang] += '-' + salt;
      }if (product.key) product.key += '-' + salt;
      product.slug[constant.PRODUCT_ANONYMIZE_SLUG_KEY] = salt;

      return product;
    }

    /**
     * Method will take a product with current and staged versions
     * it will unpublish it and update slugs so they are unique across CTP project
     * @param product ctpProduct
     */

  }, {
    key: 'anonymizeCtpProduct',
    value: function anonymizeCtpProduct(product) {
      var salt = this._getSalt();
      var actions = [];

      if (product.masterData.published) actions.push({
        action: 'unpublish'
      });

      if (product.key) actions.push({
        action: 'setKey',
        key: product.key + '-' + salt
      });

      // run through both versions
      var _arr = ['current', 'staged'];
      for (var _i = 0; _i < _arr.length; _i++) {
        var version = _arr[_i];
        var staged = version === 'staged';
        var slugs = product.masterData[version].slug;

        for (var lang in slugs) {
          // eslint-disable-line guard-for-in
          slugs[lang] += '-' + salt;
        }slugs[constant.PRODUCT_ANONYMIZE_SLUG_KEY] = salt;

        actions.push({
          action: 'changeSlug',
          slug: slugs,
          staged: staged
        });
      }

      return this.updateProduct(product, actions);
    }

    // create map of variants indexed by their sku

  }, {
    key: '_getVariantsBySkuMap',
    value: function _getVariantsBySkuMap(product) {
      return [product.masterVariant].concat((0, _toConsumableArray3.default)(product.variants)).reduce(function (map, variant) {
        map[variant.sku] = variant;
        return map;
      }, {});
    }
  }, {
    key: '_getUnpublishAction',
    value: function _getUnpublishAction() {
      return {
        action: 'unpublish'
      };
    }
  }, {
    key: '_getPublishAction',
    value: function _getPublishAction() {
      return {
        action: 'publish'
      };
    }
  }, {
    key: '_getAddVariantAction',
    value: function _getAddVariantAction(variant) {
      var staged = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

      return (0, _extends3.default)({
        action: 'addVariant',
        staged: staged
      }, variant);
    }
  }, {
    key: '_getChangeMasterVariantAction',
    value: function _getChangeMasterVariantAction(variant) {
      var staged = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

      var action = {
        action: 'changeMasterVariant',
        staged: staged
      };
      if (variant.variantId) action.variantId = variant.variantId;else action.sku = variant.sku;

      return action;
    }
  }, {
    key: '_isMasterVariantRemoved',
    value: function _isMasterVariantRemoved(product, existingSkus) {
      return !existingSkus.includes(product.masterVariant.sku);
    }
  }, {
    key: '_getRemoveVariantAction',
    value: function _getRemoveVariantAction(variant) {
      var staged = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

      var action = {
        action: 'removeVariant',
        staged: staged
      };

      if (variant.variantId) action.id = variant.variantId;else action.sku = variant.sku;

      return action;
    }

    /**
     * Test if product or productProjection is published
     * @param product Product or ProductProjection object
     * @returns {boolean}
     * @private
     */

  }, {
    key: '_isProductPublished',
    value: function _isProductPublished(product) {
      var projectionPublished = product.published;
      var masterDataPublished = product.masterData && product.masterData.published;

      return Boolean(projectionPublished || masterDataPublished);
    }
  }, {
    key: '_hasProductChanges',
    value: function _hasProductChanges(product) {
      var projection = product.hasStagedChanges;
      var masterData = product.masterData && product.masterData.hasStagedChanges;

      return Boolean(projection || masterData);
    }
  }, {
    key: '_getSalt',
    value: function _getSalt() {
      return _shortid2.default.generate() + new Date().getTime();
    }
  }, {
    key: 'getProductDraftSkus',
    value: function getProductDraftSkus(product) {
      var variants = [product.masterVariant].concat(product.variants || []);
      return _lodash2.default.map(variants, 'sku');
    }
  }, {
    key: 'getProductSkus',
    value: function getProductSkus(product) {
      return this.getProductVariants(product).map(function (v) {
        return v.sku;
      });
    }
  }, {
    key: 'getProductVariants',
    value: function getProductVariants(product) {
      return _lodash2.default.values(this.getProductVariantsMapBySku(product));
    }
  }, {
    key: 'getProductVariantsMapBySku',
    value: function getProductVariantsMapBySku(product) {
      var _product$masterData = product.masterData,
          current = _product$masterData.current,
          staged = _product$masterData.staged;

      return (0, _extends3.default)({}, _lodash2.default.keyBy(current.variants.concat(current.masterVariant), 'sku'), _lodash2.default.keyBy(staged.variants.concat(staged.masterVariant), 'sku'));
    }
  }, {
    key: 'fetchProductsFromProductDrafts',
    value: function fetchProductsFromProductDrafts(productDrafts) {
      var _this6 = this;

      var skus = _lodash2.default.flatten(productDrafts.map(function (pP) {
        return _this6.getProductDraftSkus(pP);
      }));
      var slugs = productDrafts.map(function (pP) {
        return pP.slug;
      });
      return this.getProductsBySkusOrSlugs(skus, slugs);
    }
  }, {
    key: 'changeProductType',
    value: function () {
      var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(product, newProductTypeId) {
        var productProjection;
        return _regenerator2.default.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                this.logger.debug('Changing productType', product.id);
                productProjection = this.transformProductToProjection(product);
                _context6.next = 4;
                return this.deleteByProduct(productProjection);

              case 4:
                productProjection.productType.id = newProductTypeId;
                return _context6.abrupt('return', this.createProduct(productProjection));

              case 6:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function changeProductType(_x12, _x13) {
        return _ref10.apply(this, arguments);
      }

      return changeProductType;
    }()

    /**
     * Compare if two products are the same.
     * 1. by product id
     * 2. by product type id and by slug
     */

  }, {
    key: 'isProductsSame',
    value: function isProductsSame(ctpProduct1, ctpProduct2) {
      if (ctpProduct1.id === ctpProduct2.id) return true;

      return ctpProduct1.productType.id === ctpProduct2.productType.id && _lodash2.default.isEqual(ctpProduct1.masterData.staged.slug, ctpProduct2.masterData.staged.slug);
    }
  }, {
    key: '_unpublishProduct',
    value: function () {
      var _ref11 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7(product) {
        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                return _context7.abrupt('return', this.updateProduct(product, [this._getUnpublishAction()]));

              case 1:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function _unpublishProduct(_x14) {
        return _ref11.apply(this, arguments);
      }

      return _unpublishProduct;
    }()

    /**
     * Ensure that all attributes that have sameForAll constraint will have same value after
     * the reassignment process. The same value is taken either from product draft OR set to null
     * (attr is removed) if attr is not available in product draft.
     * It's necessary to have same attribute values for:
     *
     * 1) variants that will be added to ctpProductToUpdate - done by removing the attribute
     * from the new variants
     *
     * 2) existing variants from ctpProductToUpdate - done by `setAttributeInAllVariants` action
     *
     * @param variants - checks if the values for sameForAll attributes are correct in the variants
     * @param productTypeId - fetch the product type by ID and get all sameForAll attrs for checking
     * @param productDraft - get sameForAll value from the productDraft
     * in case of sameForAll constraint violation
     * @returns {Promise.<Array>} setAttributeInAllVariants actions
     */

  }, {
    key: 'ensureSameForAllAttributes',
    value: function () {
      var _ref12 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(variants, productTypeId, productDraft) {
        var _this7 = this;

        var actions, productType, sameForAllAttrs, violatedAttrs;
        return _regenerator2.default.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                actions = [];
                _context8.next = 3;
                return this._getProductTypeById(productTypeId);

              case 3:
                productType = _context8.sent;
                sameForAllAttrs = this._selectSameForAllAttrs(productType);
                violatedAttrs = this._selectViolatedAttrs(variants, sameForAllAttrs);

                violatedAttrs.forEach(function (attribute) {
                  var value = _this7._getAttributeValue(attribute.name, productDraft);
                  variants.forEach(function (variant) {
                    var attrFromVariant = variant.attributes.find(function (a) {
                      return a.name === attribute.name;
                    });
                    if (value) attrFromVariant.value = value;else _lodash2.default.remove(variant.attributes, function (a) {
                      return a.name === attribute.name;
                    });
                  });
                  actions.push({ action: 'setAttributeInAllVariants', name: attribute.name, value: value });
                });
                return _context8.abrupt('return', actions);

              case 8:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this);
      }));

      function ensureSameForAllAttributes(_x15, _x16, _x17) {
        return _ref12.apply(this, arguments);
      }

      return ensureSameForAllAttributes;
    }()
  }, {
    key: '_getProductTypeById',
    value: function () {
      var _ref13 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9(productTypeId) {
        var productType;
        return _regenerator2.default.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                productType = this.productTypeCache.get(productTypeId);

                if (productType) {
                  _context9.next = 6;
                  break;
                }

                _context9.next = 4;
                return this._fetchCtpProductType(productTypeId);

              case 4:
                productType = _context9.sent;

                this.productTypeCache.set(productTypeId, productType);

              case 6:
                return _context9.abrupt('return', productType);

              case 7:
              case 'end':
                return _context9.stop();
            }
          }
        }, _callee9, this);
      }));

      function _getProductTypeById(_x18) {
        return _ref13.apply(this, arguments);
      }

      return _getProductTypeById;
    }()
  }, {
    key: '_getAttributeValue',
    value: function _getAttributeValue(attributeName, productDraft) {
      var value = null;
      if (productDraft) {
        var draftAttr = productDraft.masterVariant.attributes.find(function (a) {
          return a.name === attributeName;
        });
        if (draftAttr) value = draftAttr.value;
      }
      return value;
    }
  }, {
    key: '_selectViolatedAttrs',
    value: function _selectViolatedAttrs(variants, sameForAllAttrs) {
      var _this8 = this;

      return sameForAllAttrs.filter(function (attr) {
        return !_this8._areAttributeValuesSameForAll(attr, variants);
      });
    }
  }, {
    key: '_selectSameForAllAttrs',
    value: function _selectSameForAllAttrs(productType) {
      return productType.attributes.filter(function (a) {
        return a.attributeConstraint === 'SameForAll';
      });
    }
  }, {
    key: '_areAttributeValuesSameForAll',
    value: function _areAttributeValuesSameForAll(attribute, variants) {
      var attrValues = variants.map(function (variant) {
        var value = null;
        if (variant.attributes) {
          var attr = variant.attributes.find(function (a) {
            return a.name === attribute.name;
          });
          value = attr ? attr.value : null;
        }
        return value;
      });
      return _lodash2.default.uniq(attrValues).length <= 1;
    }
  }, {
    key: '_fetchCtpProductType',
    value: function _fetchCtpProductType(productTypeId) {
      return this.client.productTypes.byId(productTypeId).fetch().then(function (res) {
        return res.body;
      });
    }
  }]);
  return ProductManager;
}();

exports.default = ProductManager;