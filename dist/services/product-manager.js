'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _values = require('babel-runtime/core-js/object/values');

var _values2 = _interopRequireDefault(_values);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

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
    this.logger = logger.child({ service: 'productManager' });

    this.loadBatchCount = 20;
    this.loadConcurrency = 2;
  }

  (0, _createClass3.default)(ProductManager, [{
    key: 'createProduct',
    value: function createProduct(product) {
      this.logger.debug('Creating product', product);

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
    key: 'getProductsBySkus',
    value: async function getProductsBySkus(skus) {
      var _this = this;

      // filter out duplicates and divide skus into chunks
      var skuChunks = (0, _lodash2.default)(skus).uniq().chunk(this.loadBatchCount).value();

      var productBatches = await _bluebird2.default.map(skuChunks, function (skuChunk) {
        return _this._getProductsBySkuChunk(skuChunk);
      }, { concurrency: this.loadConcurrency // load products with concurrency
      });
      return this._filterOutDuplicateProducts(_lodash2.default.flatten(productBatches));
    }
  }, {
    key: '_filterOutDuplicateProducts',
    value: function _filterOutDuplicateProducts(products) {
      return _lodash2.default.uniqBy(products, 'id');
    }
  }, {
    key: '_getProductsBySkuChunk',
    value: function _getProductsBySkuChunk(skus) {
      var skuPredicate = skus.join('","');
      var variantsPredicate = 'masterVariant(sku IN("' + skuPredicate + '"))' + ('or variants(sku IN("' + skuPredicate + '"))');
      var predicate = 'masterData(current(' + variantsPredicate + ') or staged(' + variantsPredicate + '))';

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
    key: 'deleteByProductId',
    value: async function deleteByProductId(id) {
      var product = await this.getProductById(id);

      return product ? this.deleteByProduct(product) : _bluebird2.default.resolve();
    }
  }, {
    key: 'deleteByProduct',
    value: async function deleteByProduct(product) {
      if (this._isProductPublished(product)) product = await this._unpublishProduct(product);

      return this.client.products.byId(product.id).delete(product.version).return(null);
    }

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
      var _this2 = this;

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
          return actions.push(_this2._getAddVariantAction(productVersions.current[sku], true));
        });
      }

      // run through both variants (staged and current)
      // first change masterVariants if needed and then remove variants
      ['staged', 'current'].forEach(function (version) {
        var variantMap = _this2._getVariantsBySkuMap(masterData[version]);

        // if we deleted a masterVariant, set another variant as new masterVariant
        if (_this2._isMasterVariantRemoved(masterData[version], retainedSkus[version])) {
          var firstExistingVariant = (0, _values2.default)(productVersions[version])[0];

          actions.push(_this2._getChangeMasterVariantAction(firstExistingVariant, version === 'staged'));
        }

        // remove variants specified in skus param
        // but only if product has this variant
        deletedSkus[version].forEach(function (sku) {
          if (variantMap[sku]) actions.push(_this2._getRemoveVariantAction(variantMap[sku], version === 'staged'));
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
    key: 'fetchProductsFromProductProjections',
    value: function fetchProductsFromProductProjections(productProjections) {
      var _this3 = this;

      var skus = _lodash2.default.flatten(productProjections.map(function (pP) {
        return _this3.getProductDraftSkus(pP);
      }));
      return this.getProductsBySkus(skus);
    }
  }, {
    key: 'changeProductType',
    value: async function changeProductType(product, newProductTypeId) {
      if (product.masterData.published) await this._unpublishProduct(product);

      // fetch from product projection because it has same structure
      // as product draft. It's easier for product creation later in the process

      var _ref = await this.client.productProjections.staged(true).byId(product.id).fetch(),
          productProjection = _ref.body;

      await this.deleteByProduct(productProjection);

      productProjection.productType.id = newProductTypeId;
      return this.createProduct(productProjection);
    }

    /**
     * Compare if two products are the same.
     * 1. by product id
     * 2. by product type id and by slug
     */

  }, {
    key: 'isProductsSame',
    value: function isProductsSame(ctpProduct1, ctpProduct2) {
      if (ctpProduct1.id === ctpProduct2.id) return true;
      return ctpProduct1.productType.id === ctpProduct2.productType.id && _lodash2.default.deepEqual(ctpProduct1.masterData.staged.slug, ctpProduct2.masterData.staged.slug);
    }
  }, {
    key: '_unpublishProduct',
    value: async function _unpublishProduct(product) {
      return this.updateProduct(product, [this._getUnpublishAction()]);
    }
  }]);
  return ProductManager;
}();

exports.default = ProductManager;