/**
 * Module dependencies.
 */
var capabilities = require('./middleware/capabilities'),
	capabilitiesParser = require('./middleware/capabilitiesParser');

/**
 * Expose middleware.
 */
exports = module.exports = capabilities;
exports.capabilities = capabilities;
exports.capabilitiesParser = capabilitiesParser;